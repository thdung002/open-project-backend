const axios = require('axios');
const { getAccessToken, getDriveId } = require('./authHelper');
require('dotenv').config();

// Function to read files from the specified OneDrive folder
async function readNewTicketFiles() {
    try {
        const token = await getAccessToken();
        const driveId = await getDriveId();
        const folderPath = process.env.ONEDRIVE_FOLDER_PATH || '/new-ticket';

        console.log(`📂 Reading files from: ${folderPath}`);

        // Get files from OneDrive folder
        const response = await axios.get(
            `https://graph.microsoft.com/v1.0/drives/${driveId}/root:${folderPath}:/children`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.data || !response.data.value) {
            console.log('No files found in the new ticket folder');
            return [];
        }

        // Filter for only JSON files
        const files = response.data.value.filter(file => file.name.endsWith('.json'));
        console.log(`Found ${files.length} JSON files in the new ticket folder`);
        return files;
    } catch (error) {
        console.error('Error reading files from OneDrive:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        throw error;
    }
}

// Function to read content of a specific file
async function readFileContent(fileId) {
    try {
        const token = await getAccessToken();
        const driveId = await getDriveId();

        console.log(`📄 Reading file content for ID: ${fileId}`);

        // Get file content from OneDrive
        const response = await axios.get(
            `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}/content`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ File content retrieved successfully');
        return response.data;
    } catch (error) {
        console.error('Error reading file content:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        throw error;
    }
}

// Function to move processed file to archive folder
async function moveToArchive(fileId) {
    try {
        const token = await getAccessToken();
        const driveId = await getDriveId();
        const archivePath = process.env.ONEDRIVE_ARCHIVE_PATH || '/new-ticket/archive';

        console.log(`📦 Moving file ${fileId} to archive: ${archivePath}`);

        // Move file to archive folder in OneDrive
        await axios.patch(
            `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}`,
            {
                parentReference: {
                    path: `/drive/root:${archivePath}`
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ File moved to archive successfully');
    } catch (error) {
        console.error('Error moving file to archive:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        throw error;
    }
}

// Function to process ticket data from file content
function parseTicketData(content) {
    try {
        console.log('🔍 Parsing ticket data...');
        if (typeof content === 'string') {
            return JSON.parse(content);
        }
        return content;
    } catch (error) {
        console.error('Error parsing ticket data:', error.message);
        throw error;
    }
}

module.exports = {
    readNewTicketFiles,
    readFileContent,
    moveToArchive,
    parseTicketData
};