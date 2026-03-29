variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Application name used to name all resources"
  type        = string
  default     = "paper2colab"
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

variable "task_cpu" {
  description = "ECS task CPU units (1 vCPU = 1024)"
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "ECS task memory in MiB"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Number of ECS task replicas"
  type        = number
  default     = 1
}

variable "openai_api_key_ssm_path" {
  description = "SSM Parameter Store path for the OpenAI API key (SecureString)"
  type        = string
  default     = "/paper2colab/OPENAI_API_KEY"
}

variable "openai_model_ssm_path" {
  description = "SSM Parameter Store path for the OpenAI model name (String)"
  type        = string
  default     = "/paper2colab/OPENAI_MODEL"
}
