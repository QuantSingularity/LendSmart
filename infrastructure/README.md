# Infrastructure Directory

This directory contains the infrastructure as code (IaC) configurations and deployment automation for the LendSmart platform, enabling consistent, reproducible, and scalable deployments across different environments.

## Directory Structure

```
infrastructure/
├── README.md                         # This file
├── DEPLOYMENT.md                     # Detailed deployment guide
├── ansible/                          # Ansible playbooks and roles
│   ├── ansible.cfg                   # Ansible configuration
│   ├── inventory/                    # Server inventories
│   │   ├── hosts.yml                 # Active inventory (not in Git)
│   │   └── hosts.example.yml         # Example inventory template
│   ├── playbooks/                    # Ansible playbooks
│   ├── roles/                        # Ansible roles
│   └── group_vars/                   # Group variables
│       └── all.example.yml           # Example variables
├── kubernetes/                       # Kubernetes manifests
│   ├── base/                         # Base manifests
│   │   ├── *-deployment.yaml         # Application deployments
│   │   ├── *-service.yaml            # Kubernetes services
│   │   ├── *-statefulset.yaml        # Stateful applications
│   │   ├── app-secrets.example.yaml  # Secret template
│   │   ├── ingress.yaml              # Ingress configuration
│   │   └── poddisruptionbudget.yaml  # PDB for HA
│   ├── rbac/                         # RBAC configurations
│   │   ├── serviceaccount.yaml
│   │   ├── role.yaml
│   │   └── rolebinding.yaml
│   └── environments/                 # Environment-specific values
│       ├── dev/
│       ├── staging/
│       └── prod/
├── terraform/                        # Terraform configurations
│   ├── main.tf                       # Main configuration
│   ├── variables.tf                  # Variable definitions
│   ├── outputs.tf                    # Output definitions
│   ├── backend.tf                    # Backend configuration
│   ├── terraform.tfvars.example      # Example variables
│   ├── .terraform-version            # Terraform version pinning
│   ├── .tflint.hcl                   # TFLint configuration
│   ├── modules/                      # Terraform modules
│   │   ├── compute/                  # EC2, ASG, ALB
│   │   ├── database/                 # RDS, Aurora
│   │   ├── network/                  # VPC, subnets, routing
│   │   ├── security/                 # Security groups, IAM
│   │   ├── storage/                  # S3 buckets
│   │   └── cost_optimization/        # Scaling policies
│   └── environments/                 # Environment-specific tfvars
│       ├── dev/
│       ├── staging/
│       └── prod/
├── ci-cd/                            # CI/CD pipelines
│   └── ci-cd.yml                     # GitHub Actions workflow
├── docs/                             # Documentation
│   └── design_document.md
├── runbooks/                         # Operational runbooks
│   ├── deployment_runbook.md
│   └── incident_response.md
└── validation_logs/                  # Validation outputs
    ├── terraform_validate.txt
    ├── kubernetes_yamllint.txt
    └── ansible_lint.txt
```

## Quick Start

### Prerequisites

Install required tools:

- Terraform >= 1.6.6
- kubectl >= 1.28.0
- Ansible >= 2.14
- yamllint
- AWS CLI (for AWS deployments)

### Basic Deployment

```bash
# 1. Deploy cloud infrastructure with Terraform
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
terraform init -backend=false
terraform validate
terraform plan -out=tfplan
terraform apply tfplan

# 2. Deploy Kubernetes manifests
cd ../kubernetes
cp base/app-secrets.example.yaml base/app-secrets.yaml
# Edit app-secrets.yaml (base64 encode values)
kubectl apply -f rbac/
kubectl apply -f base/

# 3. Configure servers with Ansible
cd ../ansible
cp inventory/hosts.example.yml inventory/hosts.yml
# Edit hosts.yml with your server IPs
ansible-playbook -i inventory/hosts.yml playbooks/main.yml
```

## Components

### Terraform

Infrastructure as Code using Terraform for provisioning and managing cloud resources.

**Key Features:**

- Multi-cloud support (AWS primary, extensible to Azure/GCP)
- Modular architecture for reusability
- Environment-specific configurations (dev/staging/prod)
- Security best practices (encryption, IAM, network segmentation)
- Cost optimization with auto-scaling and lifecycle policies

**Modules:**

- `network/` - VPC, subnets, IGW, NAT, routing tables
- `compute/` - EC2 instances, Auto Scaling Groups, Launch Templates, ALB
- `database/` - RDS MySQL/Aurora with encryption and backups
- `storage/` - S3 buckets with versioning and lifecycle rules
- `security/` - Security groups, IAM roles, network ACLs
- `cost_optimization/` - Scaling policies, CloudWatch alarms

**Quick Commands:**

```bash
terraform fmt -recursive          # Format all files
terraform validate                # Validate configuration
terraform plan                    # Preview changes
terraform apply                   # Apply changes
terraform destroy                 # Destroy resources
```

### Kubernetes

Kubernetes manifests for container orchestration and microservices management.

**Key Features:**

- Microservices deployment configurations
- Horizontal Pod Autoscaling (HPA)
- StatefulSets for databases
- RBAC for security
- Pod Disruption Budgets for high availability
- Network policies for pod-to-pod communication control
- Ingress for external access

**Components:**

- Deployments: backend, frontend
- StatefulSets: database, redis
- Services: ClusterIP, LoadBalancer
- Ingress: NGINX with TLS
- RBAC: ServiceAccounts, Roles, RoleBindings
- PodDisruptionBudgets: ensure availability during updates

**Quick Commands:**

```bash
kubectl apply -f base/            # Apply manifests
kubectl get pods                  # Check pod status
kubectl logs -f <pod-name>        # View logs
kubectl describe pod <pod-name>   # Debug issues
kubectl delete -f base/           # Remove resources
```

### Ansible

Ansible playbooks and roles for automating server configuration and application deployment.

**Key Features:**

- Idempotent configuration management
- Role-based organization
- Variable-driven configuration
- Security hardening playbooks
- Zero-downtime deployment support

**Roles:**

- `common/` - Base system configuration, users, packages
- `webserver/` - NGINX configuration and SSL setup
- `database/` - MySQL/PostgreSQL installation and tuning

**Quick Commands:**

```bash
ansible all -m ping               # Test connectivity
ansible-playbook playbooks/main.yml --check  # Dry run
ansible-playbook playbooks/main.yml          # Execute
ansible-playbook playbooks/security_hardening.yml  # Harden security
```

### CI/CD

GitHub Actions workflow for continuous integration and deployment.

**Features:**

- Infrastructure validation (Terraform, Kubernetes, Ansible)
- Code linting (Smart contracts, backend, frontend)
- Automated testing (unit, integration, e2e)
- Smart contract deployment to testnets
- Security scanning

**Workflow Jobs:**

1. `infrastructure-lint` - Validate all infrastructure code
2. `lint` - Code quality checks
3. `test` - Run all test suites
4. `deploy-testnet` - Deploy contracts to Sepolia

## Deployment Environments

### Development

- Single-node deployments
- Minimal resources for cost savings
- Local Terraform state
- Shared development database

### Staging

- Production-like setup
- Multi-AZ for testing failover
- Separate database instances
- Integration testing environment

### Production

- High availability (Multi-AZ)
- Auto-scaling enabled
- Encrypted storage and backups
- Monitoring and alerting
- S3 backend for Terraform state

## Validation

### Terraform

```bash
cd terraform
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
# Expected: Success! The configuration is valid.
```

### Kubernetes

```bash
cd kubernetes
yamllint base/*.yaml rbac/*.yaml
kubectl apply --dry-run=client -f base/
# Expected: No errors, resources validated
```

### Ansible

```bash
cd ansible
ansible-lint playbooks/*.yml
ansible-playbook -i inventory/hosts.yml playbooks/main.yml --syntax-check
# Expected: No fatal errors
```

See `validation_logs/` directory for sample validation outputs.

## Security Considerations

### Secrets Management

**DO NOT commit secrets to Git!**

- Use `.example` files as templates
- Store actual secrets in:
  - AWS Secrets Manager
  - HashiCorp Vault
  - Kubernetes External Secrets
  - Ansible Vault for sensitive variables

### Required Secret Files (Git-ignored)

- `terraform/terraform.tfvars` - Terraform variables
- `kubernetes/base/app-secrets.yaml` - Kubernetes secrets
- `ansible/inventory/hosts.yml` - Server inventories
- `ansible/group_vars/all.yml` - Ansible variables

### Security Features

- **Network Security**: VPC isolation, security groups, network policies
- **Data Encryption**: RDS encryption at rest, S3 encryption, TLS in transit
- **IAM**: Least privilege roles, instance profiles
- **Compliance**: Logging enabled, audit trails, backup retention
- **Secrets**: Encrypted secret storage, no plain-text secrets

## Monitoring and Logging

### Infrastructure Monitoring

- **CloudWatch**: AWS resource metrics
- **Prometheus**: Kubernetes cluster metrics
- **Grafana**: Dashboards and visualization

### Application Logging

- **ELK Stack**: Elasticsearch, Logstash, Kibana
- **CloudWatch Logs**: Centralized log aggregation
- **Kubernetes**: Pod logs via `kubectl logs`

### Alerting

- CloudWatch Alarms for CPU, memory, disk
- PagerDuty/Slack integration
- Auto-scaling based on metrics

## Disaster Recovery

### Backup Strategy

- **Database**: Automated daily backups, 7-day retention
- **Application Data**: S3 versioning, lifecycle policies
- **Infrastructure**: Terraform state backups, Git version control

### Recovery Procedures

See `runbooks/incident_response.md` for detailed procedures:

- Database restoration
- Infrastructure recreation
- Application redeployment

## Best Practices

1. **Version Control**: All infrastructure changes via Git
2. **Testing**: Validate in dev/staging before production
3. **Documentation**: Update docs for all changes
4. **Security**: Regular security audits and updates
5. **Monitoring**: Set up alerts for critical issues
6. **Backups**: Regular backups and recovery testing
7. **Immutable Infrastructure**: Replace instead of modify
8. **CI/CD**: Automate deployments through pipelines

## Troubleshooting

### Common Issues

**Terraform: "Backend initialization required"**

```bash
terraform init
```

**Kubernetes: "ImagePullBackOff"**

```bash
kubectl describe pod <pod-name>
# Check image name and registry access
```

**Ansible: "SSH connection failed"**

```bash
# Verify SSH key permissions
chmod 600 ~/.ssh/your-key.pem
# Test manual connection
ssh -i ~/.ssh/your-key.pem user@host
```
