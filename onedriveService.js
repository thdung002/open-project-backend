const axios = require('axios');
const { getAccessToken } = require('./authHelper');
const ExcelJS = require('exceljs');
const fs = require('fs').promises;
const path = require('path');
const { updateChatMessage } = require('./chatService');
require('dotenv').config();

// Queue file path
const QUEUE_FILE = path.join(__dirname, './json/failed_updates_queue.json');

// Function to load queue from file
async function loadQueue() {
    try {
        const data = await fs.readFile(QUEUE_FILE, 'utf8');
        if (!data.trim()) {
            return new Set();
        }
        const queueData = JSON.parse(data);
        return new Set(queueData); // Direct parse of the array of objects
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(QUEUE_FILE, '[]', 'utf8');
            return new Set();
        }
        console.error('Error loading queue:', error);
        return new Set();
    }
}

// Function to save queue to file
async function saveQueue(queue) {
    try {
        // Ensure we only save essential data
        const essentialQueue = Array.from(queue).map(wp => ({
            id: wp.id,
            subject: wp.subject,
            createdAt: wp.createdAt,
            project: wp._embedded?.project?.identifier,
            messageID: wp.messageID,
            type: wp.type,
            channelID: wp.channelID
        }));
        const data = JSON.stringify(essentialQueue, null, 2);
        await fs.writeFile(QUEUE_FILE, data, 'utf8');
        // console.log(`💾 Saved ${queue.size} items to queue`);
    } catch (error) {
        console.error('Error saving queue:', error);
    }
}

// Queue for failed Excel updates
let failedUpdatesQueue = new Set();

// Initialize queue from file
loadQueue().then(queue => {
    failedUpdatesQueue = queue;
    // console.log(`📝 Loaded ${queue.size} items from queue file`);
}).catch(error => {
    console.error('Failed to initialize queue:', error);
    failedUpdatesQueue = new Set();
});

// Function to process failed updates queue
async function processFailedUpdates() {
    if (failedUpdatesQueue.size === 0) {
        // console.log('No failed updates to process');
        return;
    }

    // console.log(`🔄 Processing ${failedUpdatesQueue.size} failed Excel updates...`);
    const updatesToRetry = Array.from(failedUpdatesQueue);
    let hasSuccess = false;

    for (const workPackage of updatesToRetry) {
        try {
            // console.log(`⏳ Attempting to process work package ${workPackage.id}...`);
            await updateWorkPackageHistory(workPackage, true);
            // console.log(`✅ Successfully processed work package ${workPackage.id}`);
            failedUpdatesQueue.delete(workPackage);
            hasSuccess = true;
        } catch (error) {
            console.error(`❌ Failed to process work package ${workPackage.id}:`, error.message);
            // Keep the failed item in queue
            // console.log(`⏳ Keeping work package ${workPackage.id} in retry queue`);
        }
    }

    // Only save queue if we had at least one successful update
    if (hasSuccess) {
        await saveQueue(failedUpdatesQueue);
        // console.log(`📊 Updated queue file. ${failedUpdatesQueue.size} items remaining`);
    }
}

// Schedule retry of failed updates every 5 minutes
setInterval(processFailedUpdates, 5 * 60 * 1000);

// Function to read files from the specified OneDrive folder
async function readNewTicketFiles() {
    try {
        const token = await getAccessToken();
        const folderPath = process.env.ONEDRIVE_FOLDER_PATH || '/new-ticket';

        // console.log(`📂 Reading files from: ${folderPath}`);

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
            // console.log('No files found in the new ticket folder');
            return [];
        }

        // Filter for only JSON files
        const files = response.data.value.filter(file => file.name.endsWith('.json'));
        // console.log(`Found ${files.length} JSON files in the new ticket folder`);
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

        // console.log(`📄 Reading file content for ID: ${fileId}`);

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

        // console.log('✅ File content retrieved successfully');
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

        // console.log(`📦 Moving file ${fileId} to archive: ${archivePath}`);

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
        
        // console.log('✅ File moved to archive successfully');
    } catch (error) {
        console.error('Error moving file to archive:', error.message);
        throw error;
    }
}

// Function to process ticket data from file content
function parseTicketData(content) {
    try {
        // console.log('🔍 Parsing ticket data...');
        const data = typeof content === 'string' ? JSON.parse(content) : content;
        
        // Extract type from the file content for Excel worksheet
        const type = data.type || 'default';
        
        // Return the data with the type for Excel worksheet
        return {
            ...data,
            type // This will be used for the Excel worksheet name
        };
    } catch (error) {
        console.error('Error parsing ticket data:', error.message);
        throw error;
    }
}

async function downloadFromOneDrive(fileId) {
    try {
        const token = await getAccessToken();
        
        // console.log(`📥 Downloading file from OneDrive with ID: ${fileId}`);

        const response = await axios({
            method: 'get',
            url: `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
            headers: {
                Authorization: `Bearer ${token}`
            },
            responseType: 'arraybuffer'  // Important for handling binary files
        });

        // console.log('✅ File downloaded successfully');
        return response.data;
    } catch (error) {
        console.error('Error downloading file from OneDrive:', error.message);
        throw error;
    }
}

// Function to update Excel file with work package history
async function updateWorkPackageHistory(workPackage, isRetry = false) {
    try {
        // Extract only needed fields from work package
        const essentialData = {
            id: workPackage.id,
            subject: workPackage.subject,
            createdAt: workPackage.createdAt,
            project: workPackage._embedded?.project?.identifier,
            messageID: workPackage.messageID,
            type: workPackage.type || 'default', // Type should now come from the file content
            channelID: workPackage.channelID
        };

        const token = await getAccessToken();
        const excelPath = '/history-openproject.xlsx';
        let workbook = new ExcelJS.Workbook();
        let worksheet;
        let excelFileId = null;

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
            
            // Get or create worksheet based on type
            worksheet = workbook.getWorksheet(essentialData.type);
            if (!worksheet) {
                worksheet = workbook.addWorksheet(essentialData.type);
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

            // Check if work package already exists to avoid duplicates
            let exists = false;
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1 && row.values[1] == essentialData.id) {
                    exists = true;
                    // console.log(`Work package ${essentialData.id} already exists in row ${rowNumber}`);
                }
            });

            if (!exists) {
                const rowCount = worksheet.rowCount || 1;
                // console.log(`Current row count: ${rowCount}`);

                // Format date to DD/MM/YYYY hh:mm:ss in GMT+8
                const date = new Date(essentialData.createdAt);
                const formattedDate = date.toLocaleString('en-GB', { 
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false, // Use 24-hour format
                    timeZone: 'Asia/Singapore' // GMT+8
                });

                const newRow = worksheet.addRow([
                    essentialData.id,
                    essentialData.subject,
                    formattedDate,
                    `${process.env.OPENPROJECT_URL}/projects/${essentialData.project}/work_packages/${essentialData.id}`
                ]);

                // Add hyperlink to the last cell (link column)
                const linkCell = newRow.getCell(4);
                const url = `${process.env.OPENPROJECT_URL}/projects/${essentialData.project}/work_packages/${essentialData.id}`;
                linkCell.value = { 
                    text: `WP#${essentialData.id}`,
                    hyperlink: url,
                    type: 'hyperlink'
                };
                
                // Style the hyperlink
                linkCell.font = {
                    color: { argb: '0563C1' },
                    underline: true
                };

                // Update the original file directly
                const buffer = await workbook.xlsx.writeBuffer();
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

                // Remove the chat message update from here since it's now done earlier
                // console.log(`📝 Added new row for work package ${essentialData.id} at row ${rowCount + 1}`);
            }
        } catch (error) {
            if (error.response?.status === 404) {
                // File doesn't exist, create new worksheet
                worksheet = workbook.addWorksheet(essentialData.type);
                
                // Add headers
                worksheet.columns = [
                    { header: 'ID', key: 'id', width: 10 },
                    { header: 'Subject', key: 'subject', width: 50 },
                    { header: 'Created on', key: 'createdOn', width: 20 },
                    { header: 'Link', key: 'link', width: 50 }
                ];
                
                // Style the header row
                worksheet.getRow(1).font = { bold: true };

                // Add the first row
                const date = new Date(essentialData.createdAt);
                const formattedDate = date.toLocaleString('en-GB', { 
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                    timeZone: 'Asia/Singapore'
                });

                const newRow = worksheet.addRow([
                    essentialData.id,
                    essentialData.subject,
                    formattedDate,
                    `${process.env.OPENPROJECT_URL}/projects/${essentialData.project}/work_packages/${essentialData.id}`
                ]);

                // Add hyperlink
                const linkCell = newRow.getCell(4);
                const url = `${process.env.OPENPROJECT_URL}/projects/${essentialData.project}/work_packages/${essentialData.id}`;
                linkCell.value = { 
                    text: `WP#${essentialData.id}`,
                    hyperlink: url,
                    type: 'hyperlink'
                };
                
                linkCell.font = {
                    color: { argb: '0563C1' },
                    underline: true
                };

                // Save the new file
                const buffer = await workbook.xlsx.writeBuffer();
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

                // Remove the chat message update from here since it's now done earlier
            } else {
                console.error('Error accessing Excel file:', error);
                throw error;
            }
        }
    } catch (error) {
        console.error('Error in updateWorkPackageHistory:', error.message);
        if (!isRetry) {
            // Add only essential data to queue
            const essentialData = {
                id: workPackage.id,
                subject: workPackage.subject,
                createdAt: workPackage.createdAt,
                project: workPackage.project || workPackage._embedded?.project?.identifier,
                messageID: workPackage.messageID,
                type: workPackage.type,
                channelID: workPackage.channelID
            };
            failedUpdatesQueue.add(essentialData);
            await saveQueue(failedUpdatesQueue);
            // console.log(`📝 Added work package ${essentialData.id} to retry queue`);
        }
        throw error; // Re-throw to properly handle retry logic
    }
}

module.exports = {
    readNewTicketFiles,
    readFileContent,
    moveToArchive,
    parseTicketData,
    downloadFromOneDrive,
    updateWorkPackageHistory,
    processFailedUpdates
};