# 🚀 Developer Setup Guide - DHIS2 AI Suite

## Overview

This guide provides comprehensive instructions for setting up the DHIS2 AI Suite development environment. The system requires multiple components including DHIS2 instance access, AI services (Azure OpenAI or Ollama), and specialized development tooling.

**Estimated Setup Time**: 45-60 minutes

**Prerequisites**: Node.js 18+, Yarn, Git, Docker (optional for Ollama)

## 🛠️ System Requirements

### Minimum Requirements
- **Node.js**: 18.0.0 or higher
- **Yarn**: 1.22.0 or higher
- **Git**: 2.30.0 or higher
- **RAM**: 8GB minimum (16GB recommended for LLM processing)
- **Disk Space**: 5GB free space

### Recommended Development Environment
- **OS**: macOS 12+, Ubuntu 20.04+, or Windows 11 with WSL2
- **IDE**: IntelliJ IDEA Ultimate, VS Code with TypeScript support
- **Browser**: Chrome 100+ or Firefox 100+ (for DHIS2 app development)

## 📋 Pre-Installation Checklist

Before starting, ensure you have:

- [ ] DHIS2 instance access (play.dhis2.org or local instance)
- [ ] Azure OpenAI API access (or Ollama for local AI)
- [ ] GitHub account for repository access
- [ ] Node.js and Yarn installed
- [ ] IDE with TypeScript support configured

## 1. 🔧 Core Development Setup

### Clone Repository
```bash
git clone https://github.com/eabumere/dhis2-ai-suite.git
cd dhis2-ai-suite
```

### Install Dependencies
```bash
# Install all project dependencies
yarn install

# Verify installation
yarn --version
node --version
```

### Environment Configuration

#### Create Environment File
```bash
cp .env.example .env
```

#### Configure Required Environment Variables

Edit `.env` with your specific configuration:

```env
# =================================================================
# REQUIRED: Choose ONE AI provider (Azure OpenAI OR Ollama)
# =================================================================

# Option A: Azure OpenAI (Recommended for production)
DHIS2_AZURE_KEY=your-azure-openai-api-key
DHIS2_AZURE_ENDPOINT=https://your-resource-name.cognitiveservices.azure.com/
DHIS2_AZURE_API_INSTANCE_NAME=your-instance-name
DHIS2_AZURE_API_VERSION=2024-04-01-preview
DHIS2_OPENAI_MODEL=gpt-4o  # or gpt-4-turbo
DHIS2_AZURE_API_DEPLOYMENT_NAME=your-deployment-name

# Option B: Ollama (For local development)
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama2:13b  # or mistral:7b, codellama:13b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# =================================================================
# REQUIRED: DHIS2 Instance Configuration
# =================================================================

# Development/Testing Instance
DHIS2_API_BASE_URL=https://play.im.dhis2.org/stable-2-42-2/api
DHIS2_USERNAME=your-dhis2-username
DHIS2_PASSWORD=your-dhis2-password

# =================================================================
# OPTIONAL: Advanced Configuration
# =================================================================

# Tool Configuration
ENABLE_DELETE_TOOL=false
TEMPERATURE=0

# Database Configuration (for embeddings/vector storage)
SQLITE_DB_PATH=./data/embeddings.db
FAISS_INDEX_PATH=./data/faiss_index

# External Search API (optional)
EXTERNAL_SEARCH_URL=https://your-search-api.example.com/search
EXTERNAL_SEARCH_API_KEY=your-api-key
EXTERNAL_SEARCH_TIMEOUT=5000
```

## 2. 🤖 AI Service Configuration

### Option A: Azure OpenAI Setup (Recommended)

#### 1. Create Azure OpenAI Resource
1. Go to [Azure Portal](https://portal.azure.com)
2. Search for "Azure OpenAI"
3. Click "Create" and fill in:
   - **Subscription**: Your Azure subscription
   - **Resource Group**: Create new or select existing
   - **Region**: East US, West Europe, or another supported region
   - **Name**: Unique name for your resource
   - **Pricing Tier**: Standard S0

#### 2. Deploy Models
1. Go to your Azure OpenAI resource
2. Navigate to "Model deployments"
3. Click "Manage deployments"
4. Deploy the following models:
   - **gpt-4o** (recommended) or **gpt-4-turbo**
   - **text-embedding-ada-002** (for embeddings)

#### 3. Get API Credentials
1. Go to "Keys and Endpoint" section
2. Copy the following values:
   - **Key**: Primary or secondary key
   - **Endpoint**: Your resource endpoint URL
   - **Deployment Name**: Name of your model deployment

#### 4. Update Environment Variables
```env
DHIS2_AZURE_KEY=your-actual-key-here
DHIS2_AZURE_ENDPOINT=https://your-resource-name.cognitiveservices.azure.com/
DHIS2_AZURE_API_INSTANCE_NAME=your-resource-name
DHIS2_OPENAI_MODEL=gpt-4o
DHIS2_AZURE_API_DEPLOYMENT_NAME=your-deployment-name
```

### Option B: Ollama Setup (Local Development)

#### 1. Install Ollama
```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download from https://ollama.ai/download
```

#### 2. Start Ollama Service
```bash
# Start Ollama in background
ollama serve
```

#### 3. Pull Required Models
```bash
# Pull language models
ollama pull llama2:13b      # Primary model (13B parameters)
ollama pull mistral:7b      # Alternative model (7B parameters)
ollama pull codellama:13b   # Code-specific model

# Pull embedding model
ollama pull nomic-embed-text
```

#### 4. Verify Models
```bash
ollama list
# Should show: llama2:13b, mistral:7b, codellama:13b, nomic-embed-text
```

#### 5. Update Environment Variables
```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama2:13b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

## 3. 🏥 DHIS2 Instance Setup

### Using DHIS2 Play Instance (Recommended for Development)

#### 1. Access Play Instance
- **URL**: https://play.im.dhis2.org/stable-2-42-2
- **Username**: Create account or use existing
- **Password**: Your account password

#### 2. Verify API Access
```bash
# Test API connection
curl -u "username:password" "https://play.im.dhis2.org/stable-2-42-2/api/system/info"
```

#### 3. Update Environment Variables
```env
DHIS2_API_BASE_URL=https://play.im.dhis2.org/stable-2-42-2/api
DHIS2_USERNAME=your-username
DHIS2_PASSWORD=your-password
```

### Using Local DHIS2 Instance

#### 1. Install DHIS2 Locally
```bash
# Using Docker (recommended)
docker run --name dhis2 -p 8080:8080 dhis2/core:2.42.2

# Or download from https://dhis2.org/downloads
```

#### 2. Configure Local Instance
- **URL**: http://localhost:8080
- **Default Admin**: admin/district
- **Create user** with necessary permissions

#### 3. Update Environment Variables
```env
DHIS2_API_BASE_URL=http://localhost:8080/api
DHIS2_USERNAME=admin
DHIS2_PASSWORD=district
```

## 4. 🏃‍♂️ Running the Application

### Development Mode
```bash
# Start development server
yarn start

# Application will be available at:
# http://localhost:3000
```

### Build for Production
```bash
# Create production build
yarn build

# Deployable bundle will be in:
# build/bundle/
```

### Testing
```bash
# Run test suite
yarn test

# Run tests in watch mode
yarn test --watch

# Run tests with coverage
yarn test --coverage
```

## 5. 🔍 Verification Steps

### 1. Environment Check
```bash
# Verify Node.js and Yarn
node --version    # Should be 18+
yarn --version    # Should be 1.22+

# Verify environment file
ls -la .env      # Should exist and be readable
```

### 2. AI Service Verification

#### Azure OpenAI Test
```bash
# Test Azure OpenAI connection (requires curl or similar)
curl -X POST "https://your-resource.cognitiveservices.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2024-04-01-preview" \
  -H "Content-Type: application/json" \
  -H "api-key: your-key" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

#### Ollama Test
```bash
# Test Ollama connection
curl http://localhost:11434/api/tags

# Test model generation
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"llama2:13b","prompt":"Hello","stream":false}'
```

### 3. DHIS2 API Verification
```bash
# Test DHIS2 API connection
curl -u "username:password" "https://play.im.dhis2.org/stable-2-42-2/api/system/info"

# Should return JSON with system information
```

### 4. Application Startup Verification
1. **Start Application**: `yarn start`
2. **Check Console**: Look for successful startup messages
3. **Verify UI**: Open http://localhost:3000
4. **Test Basic Query**: Try a simple query like "Show me data elements"

## 6. 🐛 Troubleshooting

### Common Issues

#### AI Service Connection Issues

**Problem**: "Failed to connect to AI service"
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Check Azure OpenAI credentials
# Verify endpoint URL and API key in .env
```

**Problem**: "Model not found" (Ollama)
```bash
# Pull the required model
ollama pull llama2:13b

# List available models
ollama list
```

#### DHIS2 Connection Issues

**Problem**: "DHIS2 API authentication failed"
```bash
# Verify credentials
curl -u "username:password" "https://play.im.dhis2.org/stable-2-42-2/api/system/info"

# Check .env file configuration
cat .env | grep DHIS2_
```

**Problem**: "CORS errors"
- Ensure you're using the correct DHIS2 instance URL
- Verify the instance allows cross-origin requests from localhost

#### Build/Development Issues

**Problem**: "Module not found" errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules yarn.lock
yarn install
```

**Problem**: "TypeScript compilation errors"
```bash
# Check TypeScript version
npx tsc --version

# Clear TypeScript cache
npx tsc --build --clean
```

#### Performance Issues

**Problem**: "Slow response times"
- **Ollama**: Use smaller models (mistral:7b instead of llama2:13b)
- **Azure OpenAI**: Check rate limits and consider upgrading tier
- **Memory**: Ensure adequate RAM (16GB+ recommended)

## 7. 🔐 Security Considerations

### API Keys Management
- **Never commit** `.env` file to version control
- **Use environment-specific** keys for development/production
- **Rotate keys** regularly, especially after team changes

### DHIS2 Permissions
Ensure your DHIS2 user has:
- **App Management** authority (for deployment)
- **Data read/write** permissions for relevant domains
- **Metadata management** permissions for development

### Network Security
- **Use HTTPS** for all external API calls
- **Implement rate limiting** for AI service calls
- **Monitor API usage** to avoid unexpected costs

## 8. 📚 Additional Resources

### Documentation
- **DHIS2 App Platform**: https://platform.dhis2.nu/
- **DHIS2 App Runtime**: https://runtime.dhis2.nu/
- **LangChain Documentation**: https://js.langchain.com/
- **Azure OpenAI**: https://learn.microsoft.com/en-us/azure/ai-services/openai/

### Community Support
- **DHIS2 Community**: https://community.dhis2.org/
- **GitHub Issues**: Report bugs and feature requests
- **Stack Overflow**: Tag questions with `dhis2`, `langchain`, `react`

### Development Tools
- **DHIS2 CLI**: `npm install -g @dhis2/cli`
- **React DevTools**: Browser extension for debugging
- **TypeScript**: Integrated IDE support

## 9. 🚀 Deployment

### Development Deployment
```bash
# Build for development
yarn build

# Deploy to DHIS2 instance
yarn deploy
# Follow prompts for server URL, username, and password
```

### Production Deployment
1. **Configure production environment** variables
2. **Build optimized bundle**: `yarn build`
3. **Deploy to production DHIS2 instance**
4. **Verify functionality** in production environment

## 10. 📞 Support

### Getting Help
1. **Check this guide** for common issues
2. **Review application logs** in browser console
3. **Search existing issues** on GitHub
4. **Create new issue** with detailed information:
   - Environment details (OS, Node version, etc.)
   - Error messages and stack traces
   - Steps to reproduce the issue
   - Configuration (redact sensitive information)

### Debug Information
When reporting issues, include:
```bash
# System information
node --version
yarn --version
git --version

# Environment check
cat .env | grep -v "KEY\|PASSWORD\|SECRET"  # Hide sensitive data

# Application logs
# Copy from browser console or terminal output
```

---

## ✅ Setup Verification Checklist

- [ ] Repository cloned and dependencies installed
- [ ] Environment variables configured (.env file)
- [ ] AI service configured (Azure OpenAI or Ollama)
- [ ] DHIS2 instance accessible and credentials working
- [ ] Application starts without errors (`yarn start`)
- [ ] Basic queries work in the application
- [ ] No console errors in browser developer tools

**🎉 Congratulations! Your DHIS2 AI Suite development environment is now ready.**
