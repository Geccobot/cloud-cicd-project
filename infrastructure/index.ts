import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

const dbUsername = config.require("dbUsername");
const dbPassword = config.requireSecret("dbPassword");
const sshPublicKey = config.require("sshPublicKey");

const vpc = new aws.ec2.Vpc("cloud-vpc", {
  cidrBlock: "10.0.0.0/16",
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: {
    Name: "cloud-cicd-vpc",
  },
});

const internetGateway = new aws.ec2.InternetGateway("cloud-igw", {
  vpcId: vpc.id,
  tags: {
    Name: "cloud-cicd-igw",
  },
});

const publicSubnet1 = new aws.ec2.Subnet("public-subnet-1", {
  vpcId: vpc.id,
  cidrBlock: "10.0.1.0/24",
  availabilityZone: "us-east-1a",
  mapPublicIpOnLaunch: true,
  tags: {
    Name: "cloud-cicd-public-1",
  },
});

const publicSubnet2 = new aws.ec2.Subnet("public-subnet-2", {
  vpcId: vpc.id,
  cidrBlock: "10.0.2.0/24",
  availabilityZone: "us-east-1b",
  mapPublicIpOnLaunch: true,
  tags: {
    Name: "cloud-cicd-public-2",
  },
});

const privateSubnet1 = new aws.ec2.Subnet("private-subnet-1", {
  vpcId: vpc.id,
  cidrBlock: "10.0.11.0/24",
  availabilityZone: "us-east-1a",
  tags: {
    Name: "cloud-cicd-private-1",
  },
});

const privateSubnet2 = new aws.ec2.Subnet("private-subnet-2", {
  vpcId: vpc.id,
  cidrBlock: "10.0.12.0/24",
  availabilityZone: "us-east-1b",
  tags: {
    Name: "cloud-cicd-private-2",
  },
});

const publicRouteTable = new aws.ec2.RouteTable("public-route-table", {
  vpcId: vpc.id,
  routes: [
    {
      cidrBlock: "0.0.0.0/0",
      gatewayId: internetGateway.id,
    },
  ],
  tags: {
    Name: "cloud-cicd-public-rt",
  },
});

new aws.ec2.RouteTableAssociation("public-rt-assoc-1", {
  subnetId: publicSubnet1.id,
  routeTableId: publicRouteTable.id,
});

new aws.ec2.RouteTableAssociation("public-rt-assoc-2", {
  subnetId: publicSubnet2.id,
  routeTableId: publicRouteTable.id,
});

export const vpcId = vpc.id;
export const publicSubnet1Id = publicSubnet1.id;
export const publicSubnet2Id = publicSubnet2.id;
export const privateSubnet1Id = privateSubnet1.id;
export const privateSubnet2Id = privateSubnet2.id;

const backendSecurityGroup = new aws.ec2.SecurityGroup("backend-sg", {
  vpcId: vpc.id,
  description: "Allow API and SSH access to backend EC2",
  ingress: [
    {
      protocol: "tcp",
      fromPort: 5000,
      toPort: 5000,
      cidrBlocks: ["0.0.0.0/0"],
      description: "Allow API traffic",
    },
    {
      protocol: "tcp",
      fromPort: 22,
      toPort: 22,
      cidrBlocks: ["0.0.0.0/0"],
      description: "Allow SSH for deployment",
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: {
    Name: "cloud-cicd-backend-sg",
  },
});

const rdsSecurityGroup = new aws.ec2.SecurityGroup("rds-sg", {
  vpcId: vpc.id,
  description: "Allow PostgreSQL only from backend EC2",
  ingress: [
    {
      protocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      securityGroups: [backendSecurityGroup.id],
      description: "Allow PostgreSQL from backend security group",
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: {
    Name: "cloud-cicd-rds-sg",
  },
});

export const backendSecurityGroupId = backendSecurityGroup.id;
export const rdsSecurityGroupId = rdsSecurityGroup.id;

const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnet-group", {
  subnetIds: [
    privateSubnet1.id,
    privateSubnet2.id,
  ],
  tags: {
    Name: "cloud-cicd-db-subnet-group",
  },
});
export const dbSubnetGroupId = dbSubnetGroup.id;

const database = new aws.rds.Instance("cloud-database", {
  engine: "postgres",

  instanceClass: "db.t3.micro",

  allocatedStorage: 20,
  storageType: "gp2",

  dbName: "cloudapp",
  username: dbUsername,
  password: dbPassword,

  dbSubnetGroupName: dbSubnetGroup.name,

  vpcSecurityGroupIds: [
    rdsSecurityGroup.id,
  ],

  publiclyAccessible: false,

  skipFinalSnapshot: true,

  backupRetentionPeriod: 1,

  tags: {
    Name: "cloud-cicd-postgres",
  },
});

export const databaseEndpoint = database.endpoint;
export const databaseName = database.dbName;

const amazonLinux = aws.ec2.getAmi({
  mostRecent: true,
  owners: ["amazon"],
  filters: [
    {
      name: "name",
      values: ["al2023-ami-2023.*-x86_64"],
    },
    {
      name: "virtualization-type",
      values: ["hvm"],
    },
  ],
});

const ec2Role = new aws.iam.Role("backend-ec2-role", {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: "ec2.amazonaws.com",
  }),
});

const cloudWatchAgentPolicy =
  new aws.iam.RolePolicyAttachment("cloudwatch-agent-policy", {
    role: ec2Role.name,
    policyArn:
      "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
  });

const ec2InstanceProfile = new aws.iam.InstanceProfile(
  "backend-instance-profile",
  {
    role: ec2Role.name,
  }
);

const backendKeyPair = new aws.ec2.KeyPair("backend-keypair", {
  publicKey: sshPublicKey,
});

const backendInstance = new aws.ec2.Instance("backend-instance", {
  ami: amazonLinux.then((ami) => ami.id),
  instanceType: "t3.micro",
  subnetId: publicSubnet1.id,
  vpcSecurityGroupIds: [backendSecurityGroup.id],
  keyName: backendKeyPair.keyName,
  iamInstanceProfile: ec2InstanceProfile.name,
  associatePublicIpAddress: true,

  userData: `#!/bin/bash
dnf update -y
dnf install -y docker
systemctl enable docker
systemctl start docker
usermod -aG docker ec2-user
`,

  tags: {
    Name: "cloud-cicd-backend",
  },
});

export const backendPublicIp = backendInstance.publicIp;
export const backendPublicDns = backendInstance.publicDns;
export const backendInstanceId = backendInstance.id;

const frontendBucket = new aws.s3.Bucket("frontend-bucket", {
  website: {
    indexDocument: "index.html",
    errorDocument: "index.html",
  },
  tags: {
    Name: "cloud-cicd-frontend",
  },
});

const frontendPublicAccess = new aws.s3.BucketPublicAccessBlock(
  "frontend-public-access",
  {
    bucket: frontendBucket.id,
    blockPublicAcls: false,
    blockPublicPolicy: false,
    ignorePublicAcls: false,
    restrictPublicBuckets: false,
  }
);

const frontendBucketPolicy = new aws.s3.BucketPolicy(
  "frontend-bucket-policy",
  {
    bucket: frontendBucket.id,
    policy: frontendBucket.arn.apply((arn) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "PublicReadGetObject",
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: `${arn}/*`,
          },
        ],
      })
    ),
  },
  {
    dependsOn: [frontendPublicAccess],
  }
);

export const frontendBucketName = frontendBucket.id;
export const frontendWebsiteUrl = frontendBucket.websiteEndpoint;

const githubOidcProvider = new aws.iam.OpenIdConnectProvider("github-oidc", {
  url: "https://token.actions.githubusercontent.com",
  clientIdLists: ["sts.amazonaws.com"],
});

const githubDeployRole = new aws.iam.Role("github-deploy-role", {
  assumeRolePolicy: pulumi
    .all([githubOidcProvider.arn])
    .apply(([providerArn]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Federated: providerArn,
            },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:aud":
                  "sts.amazonaws.com",

                "token.actions.githubusercontent.com:sub":
                  "repo:Geccobot@178627864/cloud-cicd-project@1333482435:ref:refs/heads/main",
              },
            },
          },
        ],
      })
    ),
});

const deploymentAlertsTopic = new aws.sns.Topic("deployment-alerts-topic", {
  name: "cloud-cicd-deployment-alerts",
});

const githubDeployPolicy = new aws.iam.RolePolicy(
  "github-deploy-policy",
  {
    role: githubDeployRole.id,

    policy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "s3:ListBucket",
            "s3:GetBucketLocation",
          ],
          Resource: frontendBucket.arn,
        },
        {
          Effect: "Allow",
          Action: [
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:GetObject",
          ],
          Resource: pulumi.interpolate`${frontendBucket.arn}/*`,
        },
        {
          Effect: "Allow",
          Action: [
            "sns:Publish",
          ],
          Resource: deploymentAlertsTopic.arn,
        },
      ],
    }),
  }
);

export const githubDeployRoleArn = githubDeployRole.arn;


const backendLogGroup = new aws.cloudwatch.LogGroup("backend-log-group", {
  name: "/cloud-cicd/backend",
  retentionInDays: 7,
});

const ec2CpuAlarm = new aws.cloudwatch.MetricAlarm("ec2-high-cpu", {
  alarmDescription: "Alert when backend EC2 CPU exceeds 80%",
  namespace: "AWS/EC2",
  metricName: "CPUUtilization",
  statistic: "Average",
  period: 300,
  evaluationPeriods: 2,
  threshold: 80,
  comparisonOperator: "GreaterThanThreshold",
  dimensions: {
    InstanceId: backendInstance.id,
  },
  treatMissingData: "notBreaching",
});

const rdsConnectionAlarm = new aws.cloudwatch.MetricAlarm(
  "rds-high-connections",
  {
    alarmDescription: "Alert when RDS connections exceed threshold",
    namespace: "AWS/RDS",
    metricName: "DatabaseConnections",
    statistic: "Average",
    period: 300,
    evaluationPeriods: 2,
    threshold: 20,
    comparisonOperator: "GreaterThanThreshold",
    dimensions: {
      DBInstanceIdentifier: database.identifier,
    },
    treatMissingData: "notBreaching",
  }
);

export const backendLogGroupName = backendLogGroup.name;
export const ec2CpuAlarmName = ec2CpuAlarm.name;
export const rdsConnectionAlarmName = rdsConnectionAlarm.name;


const backendLogsPolicy = new aws.iam.RolePolicy("backend-logs-policy", {
  role: ec2Role.id,
  policy: backendLogGroup.arn.apply((logGroupArn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ],
          Resource: `${logGroupArn}:*`,
        },
      ],
    })
  ),
});

export const backendLogsPolicyId = backendLogsPolicy.id;



export const deploymentAlertsTopicArn = deploymentAlertsTopic.arn;