# Cloud-Native Full-Stack CI/CD Application

A containerized full-stack application deployed to AWS using Infrastructure as Code, automated CI/CD, cloud security practices, and application monitoring.

This project demonstrates the deployment of a React frontend, Node.js/Express backend, and PostgreSQL database using AWS services, Pulumi, Docker, and GitHub Actions.

## Architecture

The application uses the following architecture:

```text
                         GitHub
                           │
                           │ Push to main
                           ▼
                    GitHub Actions
                     CI/CD Pipeline
                      /         \
                     /           \
                    ▼             ▼
              React Build     Docker Build
                    │             │
                    ▼             ▼
                Amazon S3      Amazon EC2
                Frontend       Node.js API
                                  │
                                  │ PostgreSQL
                                  ▼
                              Amazon RDS
                                  
Pulumi
  │
  └── Provisions AWS infrastructure
       ├── VPC
       ├── Public/Private Subnets
       ├── Security Groups
       ├── EC2
       ├── RDS
       ├── S3
       ├── IAM
       ├── CloudWatch
       └── SNS

CloudWatch
  ├── Application Logs
  ├── API Metrics
  └── System Health Alarms

SNS
  └── Deployment Failure Notifications
```

## Technologies

### Frontend
- React
- TypeScript
- Amazon S3

### Backend
- Node.js
- Express
- TypeScript
- PostgreSQL
- Docker

### Cloud & DevOps
- AWS
- Pulumi
- GitHub Actions
- Docker
- Amazon EC2
- Amazon RDS
- Amazon S3
- Amazon CloudWatch
- Amazon SNS
- AWS IAM
- GitHub OIDC

## Infrastructure as Code

AWS infrastructure is managed through **Pulumi using TypeScript**.

The Pulumi configuration provisions:

- Custom VPC
- Public and private subnets
- Internet Gateway
- Route tables
- EC2 backend instance
- RDS PostgreSQL database
- RDS subnet group
- S3 frontend bucket
- Security groups
- IAM roles and instance profiles
- GitHub OIDC provider and deployment role
- CloudWatch log groups and alarms
- SNS deployment notification topic

This allows the cloud infrastructure to be recreated and modified through code rather than relying on manual AWS configuration.

## Frontend Deployment

The React application is built for production and deployed as a static website using Amazon S3.

The GitHub Actions pipeline automatically:

1. Installs frontend dependencies
2. Runs frontend tests
3. Creates a production build
4. Authenticates with AWS
5. Synchronizes the build with the S3 bucket

The production frontend communicates with the backend API running on EC2.

## Backend Deployment

The backend is a Node.js/Express API packaged as a Docker container.

The production container exposes the API on port `5000`.

During deployment, GitHub Actions:

1. Builds the backend
2. Creates the Docker image
3. Transfers the image to EC2 using SSH
4. Loads the new image
5. Replaces the existing backend container
6. Performs an API health check

The backend provides endpoints including:

```text
GET /api/health
GET /api/data
```

The `/api/data` endpoint retrieves data from the PostgreSQL database hosted on Amazon RDS.

## Database

PostgreSQL is hosted using Amazon RDS.

The database is deployed into private subnets and is not intended to accept direct public application traffic.

Network access is controlled using AWS security groups so the backend EC2 instance can communicate with PostgreSQL on port `5432`.

The application demonstrates database integration by retrieving records from RDS through the backend API and displaying them in the React frontend.

## CI/CD Pipeline

GitHub Actions provides continuous integration and deployment.

A push to the `main` branch triggers the workflow:

```text
Push to main
      │
      ▼
Build & Test
      │
      ├───────────────┐
      ▼               ▼
Deploy Frontend   Deploy Backend
      │               │
      ▼               ▼
     S3          Docker on EC2
                      │
                      ▼
                 Health Check
                      │
               ┌──────┴──────┐
               ▼             ▼
            Success        Failure
                            │
                            ▼
                         Rollback
```

The workflow handles:

- Dependency installation
- Application builds
- Automated frontend testing
- S3 frontend deployment
- Docker image creation
- EC2 backend deployment
- Health verification
- Backend rollback
- Deployment failure notification

## Rollback Strategy

Before replacing the backend container, the currently running Docker image is preserved as a rollback image.

After deployment, GitHub Actions requests:

```text
GET /api/health
```

If the new application responds successfully, deployment completes.

If the health check fails:

1. Logs from the failed container are captured
2. The failed container is stopped and removed
3. The previous Docker image is restored
4. The workflow exits with a failure

This prevents an unhealthy backend deployment from remaining active.

## Security

### GitHub OIDC

GitHub Actions authenticates to AWS using **OpenID Connect (OIDC)**.

Instead of storing permanent AWS access keys in GitHub, the workflow receives a temporary GitHub identity token and assumes a restricted AWS IAM deployment role.

The role trust policy limits access to the project's GitHub repository and `main` branch.

### IAM

Separate permissions are used for CI/CD deployment and EC2 runtime operations.

The GitHub deployment role is restricted to the AWS operations required by the deployment process, including frontend S3 deployment and SNS deployment notifications.

The EC2 instance uses an IAM instance profile for AWS access required at runtime, including CloudWatch logging.

### Network Security

The infrastructure uses a custom VPC with public and private subnets.

Security groups restrict communication between application components.

```text
Internet
   │
   ▼
Frontend / Backend
   │
   ▼
EC2 Backend Security Group
   │
   │ PostgreSQL :5432
   ▼
RDS Security Group
   │
   ▼
PostgreSQL
```

The RDS database is placed within private subnets and database access is restricted to the backend.

### Secrets

Sensitive deployment values are not committed to the repository.

GitHub Actions Secrets are used for deployment configuration and credentials required by the workflow.

## Monitoring

Amazon CloudWatch provides application and infrastructure monitoring.

### Backend Logging

Docker sends backend application output to the CloudWatch log group:

```text
/cloud-cicd/backend
```

API requests are logged using structured JSON:

```json
{
  "type": "api_request",
  "method": "GET",
  "path": "/api/health",
  "status": 200,
  "responseTime": 7
}
```

### API Metrics

CloudWatch metric filters convert application logs into custom metrics.

The application tracks:

- `APIRequestCount` — API throughput
- `APIResponseTime` — request performance
- `API5xxErrors` — server error frequency

### System Monitoring

CloudWatch monitors infrastructure health including:

- EC2 CPU utilization
- EC2 memory utilization
- EC2 disk utilization
- RDS database connections

The CloudWatch Agent installed on EC2 supplies operating-system metrics such as memory and disk utilization.

### Alerts

CloudWatch alarms are configured for:

- High EC2 CPU usage
- High EC2 memory usage
- High EC2 disk usage
- API 5xx errors
- RDS connection thresholds

## Deployment Failure Notifications

Amazon SNS provides deployment failure notifications.

If the test, frontend deployment, or backend deployment job fails, a GitHub Actions notification job publishes a message to an SNS topic.

Confirmed subscribers receive an email containing information about the failed deployment and a link to the GitHub Actions run.

This notification path was tested by intentionally triggering a failed CI run and verifying delivery of the SNS email.

## Repository Structure

```text
cloud-cicd-project/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── Dockerfile
│   └── package.json
│
├── backend/
│   ├── src/
│   ├── Dockerfile
│   └── package.json
│
├── infrastructure/
│   ├── index.ts
│   ├── Pulumi.yaml
│   └── package.json
│
├── .github/
│   └── workflows/
│       └── deploy.yml
│
└── README.md
```

## Local Development

### Frontend

```bash
cd frontend
npm install
npm start
```

### Backend

```bash
cd backend
npm install
npm run build
npm start
```

The backend requires the appropriate PostgreSQL environment variables to connect to a database.

## Infrastructure Deployment

Pulumi is used to preview and apply infrastructure changes.

```bash
cd infrastructure

pulumi preview
pulumi up
```

The active stack contains the AWS resources required by the application.

## Testing

Frontend tests can be run with:

```bash
cd frontend
npm test -- --watchAll=false
```

The CI/CD pipeline automatically runs application tests before deployment. A failed test prevents the deployment jobs from proceeding and triggers the deployment failure notification process.

## Project Goals

This project demonstrates several core cloud and DevOps practices:

- Infrastructure as Code
- Containerized application deployment
- Automated CI/CD
- Cloud networking
- Secure IAM configuration
- OIDC authentication
- Database isolation
- Application logging
- Infrastructure monitoring
- Automated alerts
- Deployment health checks
- Automated rollback

Together, these components provide an automated deployment workflow for a full-stack cloud application on AWS.