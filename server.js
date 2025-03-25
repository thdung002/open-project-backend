const axios = require("axios");
const { getData } = require("./dataService");
const { readNewTicketFiles, readFileContent, moveToArchive, parseTicketData } = require("./onedriveService");
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
require("dotenv").config();

const OPENPROJECT_API_URL = `${process.env.OPENPROJECT_URL}/work_packages`;
const AUTH_HEADER = `Basic ${Buffer.from(`apikey:${process.env.OPENPROJECT_TOKEN}`).toString("base64")}`;


async function createTicket(ticketData) {
    const { subject, projectName, description, priorityName, accountableName, releaseDate, from } = ticketData;
    
    // Fetch IDs from the partitioned data
    const projectID = getData("projects", projectName);
    // const assigneeID = getData("users", assigneeName);
    // const typeID = getData("types", typeName) || 1;
    const priorityID = getData("priorities", priorityName) || 7;
    const responsibleID = getData("users", from) || null;

    // Validate all IDs
    if (!projectID || !priorityID) {
        throw new Error("Invalid project, assignee, type, or priority");
    }

    const requestBody = {
        "subject": subject,
        "_type": "WorkPackage",
        "description": { "format": "markdown", "raw": description, "html": "" },
        "customField16": { "format": "markdown", "raw": accountableName, "html": "" },
        "customField20": releaseDate,
        "_links": {
            "project": { "href": `/api/v3/projects/${projectID}` },
            "assignee": { "href": `/api/v3/users/123` },
            "type": { "href": `/api/v3/types/6` },
            "priority": { "href": `/api/v3/priorities/${priorityID}` },
            "responsible": responsibleID ? { "href": `/api/v3/users/${responsibleID}` } : null
        }
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


const CHECK_INTERVAL = process.env.INTERVAL_CHECK * 60 * 1000; // 1 minutes in milliseconds

// Schedule regular checks
setInterval(processNewTickets, CHECK_INTERVAL);

// Initial checks
processNewTickets();
