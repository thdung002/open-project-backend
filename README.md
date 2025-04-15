# OpenProject Ticket Creator with OneDrive Integration

This application automatically creates OpenProject tickets from JSON files stored in a OneDrive folder.

## Environment Setup

### 1. Create Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Fill in the details:
   - Name: "OpenProject Ticket Creator" (or your preferred name)
   - Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
   - Redirect URI: Select "Public client/native (mobile & desktop)" and enter "http://localhost:3000"
5. Click "Register"

### 2. Configure API Permissions

1. In your app registration, go to "API permissions"
2. Click "Add a permission"
3. Select "Microsoft Graph"
4. Choose "Delegated permissions" (not Application permissions)
5. Add these permissions:
   - Files.ReadWrite
   - Files.ReadWrite.All
   - User.Read
6. Click "Add permissions"

### 3. Create Client Secret

1. In your app registration, go to "Certificates & secrets"
2. Click "New client secret"
3. Add a description (e.g., "OpenProject Integration")
4. Choose an expiration (e.g., 12 months)
5. Click "Add"
6. IMPORTANT: Copy the secret value immediately (you won't see it again)

### 4. Set Up Environment Variables

1. Create a `.env` file in the project root
2. Add the following variables:

```env
# OpenProject Configuration
OPENPROJECT_API_URL=https://your-openproject-instance.com
OPENPROJECT_TOKEN=your-openproject-api-token

# Microsoft Graph Configuration
MICROSOFT_TENANT_ID=your-tenant-id            # From Azure AD Overview
MICROSOFT_CLIENT_ID=your-client-id            # From App Registration
MICROSOFT_CLIENT_SECRET=your-client-secret    # From Certificates & secrets

# OneDrive Configuration
ONEDRIVE_FOLDER_PATH=/new-ticket             # OneDrive folder for new tickets
ONEDRIVE_ARCHIVE_PATH=/new-ticket/archive    # OneDrive folder for processed tickets

# Server Configuration
PORT=3000                                    # Application port
```

### 5. Install Dependencies

```bash
npm install
```

### 6. Run the Application

```bash
npm start
```

The first time you run the application:
1. It will use MSAL authentication
2. The folders will be automatically created in your OneDrive
3. The application will monitor these folders for new ticket files

## Ticket JSON Format

Place JSON files in the new-ticket folder with this structure:

```json
{
    "subject": "Ticket Subject",
    "projectName": "Project Name",
    "description": "Ticket Description",
    "assigneeName": "Assignee Name",
    "typeName": "Type Name",
    "priorityName": "Priority Name",
    "statusName": "Status Name",
    "accountableName": "Accountable Person Name",
    "releaseDate": "YYYY-MM-DD"
}
```

## Troubleshooting

1. Authentication Issues:
   - Make sure you've added all required permissions in Azure AD
   - Check that your client ID and secret are correct
   - Verify you're using the correct tenant ID

2. File Access Issues:
   - The folders will be created automatically in your OneDrive
   - Make sure JSON files are properly formatted
   - Check file permissions in OneDrive

3. OpenProject Issues:
   - Verify the OpenProject URL and token
   - Check if project and user names match exactly
