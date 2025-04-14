const axios = require('axios');
const { getAccessToken } = require('./authHelper');
const ExcelJS = require('exceljs');
require('dotenv').config();

// Function to read files from the specified OneDrive folder
async function readNewTicketFiles() {
    try {
        const token = await getAccessToken();
        const folderPath = process.env.ONEDRIVE_FOLDER_PATH || '/new-ticket';

        console.log(`📂 Reading files from: ${folderPath}`);

        // Get files from OneDrive folder
        const response = await axios.get(
            `https://graph.microsoft.com/v1.0/me/drive/root:${folderPath}:/children`,
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
        throw error;
    }
}

// Function to read content of a specific file
async function readFileContent(fileId) {
    try {
        const token = await getAccessToken();

        console.log(`📄 Reading file content for ID: ${fileId}`);

        // Get file content from OneDrive
        const response = await axios.get(
            `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
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
        throw error;
    }
}

// Function to move processed file to archive folder
async function moveToArchive(fileId) {
    try {
        const token = await getAccessToken();
        const archivePath = process.env.ONEDRIVE_ARCHIVE_PATH || '/new-ticket/archive';

        console.log(`📦 Moving file ${fileId} to archive: ${archivePath}`);

        // Move file to archive folder in OneDrive
        await axios.patch(
            `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`,
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

async function downloadFromOneDrive(fileId) {
    try {
        const token = await getAccessToken();
        
        console.log(`📥 Downloading file from OneDrive with ID: ${fileId}`);

        const response = await axios({
            method: 'get',
            url: `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
            headers: {
                Authorization: `Bearer ${token}`
            },
            responseType: 'arraybuffer'  // Important for handling binary files
        });

        console.log('✅ File downloaded successfully');
        return response.data;
    } catch (error) {
        console.error('Error downloading file from OneDrive:', error.message);
        throw error;
    }
}

// Function to update Excel file with work package history
// Function to update Excel file with work package history
async function updateWorkPackageHistory(workPackage) {
    try {
        // Get the Excel file from OneDrive
        const excelPath = '/history-openproject.xlsx';
        let workbook = new ExcelJS.Workbook();
        let worksheet;
        let excelFileId = null;
        const token = await getAccessToken();

        try {
            // Try to get existing file
            const response = await axios.get(
                `https://graph.microsoft.com/v1.0/me/drive/root:${excelPath}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );
            excelFileId = response.data.id;
            
            // Download the file content
            const fileContent = await axios.get(
                `https://graph.microsoft.com/v1.0/me/drive/items/${excelFileId}/content`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    responseType: 'arraybuffer'
                }
            );
            
            // Load the workbook
            await workbook.xlsx.load(fileContent.data);
            worksheet = workbook.getWorksheet('Work Packages');
            
            // If worksheet doesn't exist, create it
            if (!worksheet) {
                worksheet = workbook.addWorksheet('Work Packages');
                // Add headers
                worksheet.columns = [
                    { header: 'ID', key: 'id', width: 10 },
                    { header: 'Subject', key: 'subject', width: 50 },
                    { header: 'Created on', key: 'createdOn', width: 20 },
                    { header: 'Link', key: 'link', width: 50 }
                ];
                // Style the header row
                worksheet.getRow(1).font = { bold: true };
            }
        } catch (error) {
            if (error.response?.status === 404) {
                // File doesn't exist, create new worksheet
                worksheet = workbook.addWorksheet('Work Packages');
                
                // Add headers
                worksheet.columns = [
                    { header: 'ID', key: 'id', width: 10 },
                    { header: 'Subject', key: 'subject', width: 50 },
                    { header: 'Created on', key: 'createdOn', width: 20 },
                    { header: 'Link', key: 'link', width: 50 }
                ];
                
                // Style the header row
                worksheet.getRow(1).font = { bold: true };
            } else {
                console.error('Error accessing Excel file:', error);
                throw error;
            }
        }

        // Verify worksheet exists before adding row
        if (!worksheet) {
            throw new Error('Worksheet could not be initialized');
        }

        // Add new row
        worksheet.addRow({
            id: workPackage.id,
            subject: workPackage.subject,
            createdOn: new Date(workPackage.createdAt).toLocaleString(),
            link: `${process.env.OPENPROJECT_URL}/work_packages/${workPackage.id}`
        });

        // Convert workbook to buffer
        const buffer = await workbook.xlsx.writeBuffer();

        // Function to attempt file upload with retries
        const uploadFile = async (retryCount = 0) => {
            try {
                if (excelFileId) {
                    // Update existing file
                    await axios.put(
                        `https://graph.microsoft.com/v1.0/me/drive/items/${excelFileId}/content`,
                        buffer,
                        {
                            headers: {
                                Authorization: `Bearer ${token}`,
                                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                            }
                        }
                    );
                } else {
                    // Create new file
                    await axios.put(
                        `https://graph.microsoft.com/v1.0/me/drive/root:${excelPath}:/content`,
                        buffer,
                        {
                            headers: {
                                Authorization: `Bearer ${token}`,
                                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                            }
                        }
                    );
                }
            } catch (error) {
                if (error.response?.status === 423 && retryCount < 5) {
                    // Wait for 2 seconds before retrying
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    console.log(`Retrying file upload (attempt ${retryCount + 1})...`);
                    return uploadFile(retryCount + 1);
                }
                throw error;
            }
        };

        // Attempt to upload the file with retries
        await uploadFile();

        console.log('✅ Updated work package history in OneDrive Excel file');
    } catch (error) {
        console.error('Error updating work package history:', error);
        throw error;
    }
}

module.exports = {
    readNewTicketFiles,
    readFileContent,
    moveToArchive,
    parseTicketData,
    downloadFromOneDrive,
    updateWorkPackageHistory
};