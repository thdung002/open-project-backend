const axios = require("axios");
const { getData } = require("./dataService");
const { readNewTicketFiles, readFileContent, moveToArchive, parseTicketData } = require("./onedriveService");
const path = require('path');
const { downloadFromOneDrive } = require('./onedriveService');
const FormData = require('form-data');
require("dotenv").config();
const fs = require('fs');
const os = require('os');

const OPENPROJECT_API_URL = `${process.env.OPENPROJECT_URL}/work_packages`;
const AUTH_HEADER = `Basic ${Buffer.from(`apikey:${process.env.OPENPROJECT_TOKEN}`).toString("base64")}`;


async function createTicket(ticketData) {
    const { subject, projectName, description, priorityName, accountableName, releaseDate, from ,assigneeName , attachments} = ticketData;
    
    // Fetch IDs from the partitioned data
    const projectID = getData("projects", projectName);
    const assigneeID = getData("users", assigneeName);
    // const typeID = getData("types", typeName) || 1;
    const priorityID = getData("priorities", priorityName) || 7;
    const responsibleID = getData("users", accountableName) || null;

    // Validate all IDs
    if (!projectID || !priorityID || !assigneeID) {
        throw new Error("Invalid project , assignee or priority");
    }

    let fullDescription = description;
    let uploadedAttachments = [];

    if (attachments && attachments.length > 0) {
        // Upload each attachment and collect OpenProject links
        for (const attachment of attachments) {
            try {
                // Download from OneDrive
                const fileContent = await downloadFromOneDrive(attachment.id);
                
                // Create a temporary file
                const tempFilePath = path.join(os.tmpdir(), attachment.name);
                await fs.promises.writeFile(tempFilePath, fileContent);

                // Create FormData
                const formData = new FormData();
                
                // Append the metadata first
                formData.append('metadata', JSON.stringify({
                    fileName: attachment.name
                }));

                // Append the file from the temporary location
                formData.append('file', fs.createReadStream(tempFilePath));

                // Upload to OpenProject
                const uploadResponse = await axios.post(`${process.env.OPENPROJECT_URL}/attachments`, 
                    formData,
                    {
                        headers: {
                            'Authorization': AUTH_HEADER,
                            ...formData.getHeaders()
                        }
                    }
                );
                // Clean up temporary file
                await fs.promises.unlink(tempFilePath);
                uploadedAttachments.push({
                    name: attachment.name,
                    id: uploadResponse.data.id
                });
            } catch (error) {
                console.error(`Error processing attachment ${attachment.name}:`, error);
            }
        }

        // Add attachment links to description
        if (uploadedAttachments.length > 0) {
            fullDescription += '\n\n**Attachments:**\n';
            uploadedAttachments.forEach(attachment => {
                fullDescription += `<img class="op-uc-image" src="/api/v3/attachments/${attachment.id}/content">\n`;
            });
        }
    }

    const requestBody = {
        "subject": subject,
        "_type": "WorkPackage",
        "description": { "format": "markdown", "raw": fullDescription, "html": "" },
        "customField20": releaseDate,
        "_links": {
            "project": { "href": `/api/v3/projects/${projectID}` },
            "assignee": { "href": `/api/v3/users/${assigneeID}` },
            "type": { "href": `/api/v3/types/6` },
            "responsible":{ "href": `/api/v3/users/${responsibleID}` },
            "priority": { "href": `/api/v3/priorities/${priorityID}` },
            "responsible": responsibleID ? { "href": `/api/v3/users/${responsibleID}` } : null,
            "attachments": uploadedAttachments.map(attachment => ({
                "href": `/api/v3/attachments/${attachment.id}`
            }))
        },
        ...(responsibleID === null && {
            "customField16": { "format": "markdown", "raw": accountableName, "html": "" }
        }),

    };

    try {
        const response = await axios.post(OPENPROJECT_API_URL, requestBody, {
            headers: {
                "Authorization": AUTH_HEADER,
                "Content-Type": "application/json"
            }
        });
        return response.data;
    } catch (error) {
        console.error('OpenProject API Error:', error.response?.data || error.message);
        throw new Error(`Failed to create ticket: ${error.response?.data?.message || error.message}`);
    }
}

// Function to process files from OneDrive
async function processNewTickets() {
    try {
        console.log("🔍 Checking for new tickets in OneDrive...");
        const files = await readNewTicketFiles();

        for (const file of files) {
            try {
                console.log(`📄 Processing file: ${file.name}`);
                const content = await readFileContent(file.id);
                const ticketData = parseTicketData(content);
                
                // Create ticket in OpenProject
                const ticket = await createTicket(ticketData);
                console.log(`✅ Created ticket: ${ticket.subject}`);

                // Move processed file to archive
                await moveToArchive(file.id);
                console.log(`📦 Moved ${file.name} to archive`);
            } catch (error) {
                console.error(`❌ Error processing file ${file.name}:`, error.message);
                // Continue with next file even if one fails
                continue;
            }
        }
    } catch (error) {
        console.error("❌ Error in ticket processing:", error.message);
    }
}

console.log("🚀 Starting OneDrive ticket processor...");

const CHECK_INTERVAL = process.env.INTERVAL_CHECK * 60 * 1000; // 1 minutes in milliseconds

// Schedule regular checks
setInterval(processNewTickets, CHECK_INTERVAL);

// Initial checks
processNewTickets();
