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