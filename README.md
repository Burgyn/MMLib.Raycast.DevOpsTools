# Azure DevOps Tools for Raycast

A Raycast extension to view and manage Azure DevOps pull requests directly from your desktop.

## Features

- **View Pull Requests**: Display pull requests from the last 7, 14, 21, or 31 days
- **Detailed Information**: See PR status, author, creation date, source/target branches
- **Quick Actions**: Open PRs in browser, copy URLs, view detailed descriptions
- **Reviewer Status**: See reviewer votes and approval status
- **Easy Configuration**: Simple setup through Raycast preferences

## Prerequisites

### 1. Azure CLI Installation

Install Azure CLI if you haven't already:

```bash
# macOS (using Homebrew)
brew install azure-cli

# Or download from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
```

### 2. Azure CLI Login

Log in to Azure CLI with your Azure DevOps account:

```bash
az login
```

### 3. Azure DevOps Extension

Install the Azure DevOps extension for Azure CLI:

```bash
az extension add --name azure-devops
```

## Setup

### 1. Install the Extension

Install this extension through Raycast Store or by building it locally.

### 2. Configure Preferences

Open Raycast preferences and configure the following for this extension:

- **Azure DevOps Organization**: Your organization name (e.g., `krossk` from `dev.azure.com/krossk`)
- **Project Name**: Your project name (e.g., `Esw`)
- **Repository Name**: Your repository name (e.g., `Invoicing`)

To find these values from your Azure DevOps URL:
```
https://dev.azure.com/[ORGANIZATION]/[PROJECT]/_git/[REPOSITORY]
```

## Usage

### Commands

#### Show Last Pull Requests

- **Default**: Shows pull requests from the last 7 days
- **Time Range**: Use the dropdown to change to 14, 21, or 31 days
- **Search**: Use Raycast's built-in search to filter results

### Keyboard Shortcuts

- **Enter**: View pull request details
- **Cmd + Enter**: Open pull request in browser
- **Cmd + R**: Refresh the list

### Pull Request Details

When viewing a pull request, you'll see:

- Full title and description
- Creation date and author
- Source and target branches
- PR status (Active, Completed, Abandoned)
- Reviewer status with votes:
  - ✅ Approved
  - ❌ Rejected  
  - ⏳ Waiting for review

## Troubleshooting

### "Azure CLI is not logged in"

If you see this error:

1. Run `az login` in your terminal
2. Follow the authentication flow
3. Refresh the extension

### "Command not found: az"

1. Install Azure CLI (see Prerequisites)
2. Restart your terminal/Raycast

### No pull requests showing

1. Verify your organization/project/repository names in preferences
2. Check that you have access to the repository
3. Try increasing the day range

### Permission errors

Ensure your Azure account has access to:
- The Azure DevOps organization
- The specific project and repository
- Pull request read permissions

## Example Configuration

For the URL `https://dev.azure.com/krossk/Esw/_git/Invoicing/pullrequests`:

- **Organization**: `krossk`
- **Project**: `Esw`  
- **Repository**: `Invoicing`

## Development

### Building Locally

```bash
npm install
npm run dev
```

### Commands

- `npm run build` - Build the extension
- `npm run dev` - Run in development mode
- `npm run lint` - Run linter
- `npm run fix-lint` - Fix linting issues

## License

MIT License - see LICENSE file for details.