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

// Function to schedule archive on Monday
function scheduleArchiveOnMonday() {
    const now = new Date();
    const nextMonday = new Date();
    
    // Set to next Monday at 00:00 (midnight)
    nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7));
    nextMonday.setHours(0, 0, 0, 0);
    
    // If it's already Monday, set to next Monday
    if (now.getDay() === 1 && now.getHours() >= 0) {
        nextMonday.setDate(nextMonday.getDate() + 7);
    }
    
    const timeUntilNextMonday = nextMonday.getTime() - now.getTime();
    
    console.log(`📅 Next archive scheduled for: ${nextMonday.toLocaleString()}`);
    
    // Schedule the first run
    setTimeout(() => {
        // Run the archive process
        archiveOldFiles();
        
        // Schedule subsequent runs every week
        setInterval(archiveOldFiles, 7 * 24 * 60 * 60 * 1000);
    }, timeUntilNextMonday);
}

console.log("🚀 Starting OneDrive ticket processor...");
// Function to create zip archive
async function createArchive(files, archiveName) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(archiveName);
        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });

        output.on('close', () => {
            console.log(`✅ Archive created: ${archiveName}`);
            resolve(archiveName);
        });

        archive.on('error', (err) => {
            console.error('❌ Error creating archive:', err);
            reject(err);
        });

        archive.pipe(output);

        // Add files to archive
        files.forEach(file => {
            archive.file(file.path, { name: file.name });
        });

        archive.finalize();
    });
}

// Function to get files older than a week
function getOldFiles(directory, daysOld = 7) {
    if (!fs.existsSync(directory)) {
        console.log(`Directory does not exist: ${directory}`);
        return [];
    }

    const files = fs.readdirSync(directory)
        .map(file => ({
            name: file,
            path: path.join(directory, file),
            stats: fs.statSync(path.join(directory, file))
        }))
        .filter(file => {
            const fileAge = Date.now() - file.stats.mtime.getTime();
            return fileAge > (daysOld * 24 * 60 * 60 * 1000);
        });

    return files;
}

// Function to archive old files
async function archiveOldFiles() {
    try {
        console.log('🔍 Checking for old files to archive...');
        const archiveDir = process.env.ONEDRIVE_ARCHIVE_PATH;
        
        if (!archiveDir) {
            console.error('❌ ONEDRIVE_ARCHIVE_PATH environment variable is not set');
            return;
        }

        console.log(`Checking directory: ${archiveDir}`);
        const oldFiles = getOldFiles(archiveDir);

        if (oldFiles.length === 0) {
            console.log('No old files to archive');
            return;
        }

        console.log(`Found ${oldFiles.length} files older than a week`);

        // Create archive with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archiveName = path.join(archiveDir, `archive_${timestamp}.zip`);

        // Create the archive
        await createArchive(oldFiles, archiveName);

        // Delete the original files after successful archive
        oldFiles.forEach(file => {
            fs.unlinkSync(file.path);
            console.log(`Deleted original file: ${file.name}`);
        });

        console.log('✅ Archive process completed successfully');
    } catch (error) {
        console.error('❌ Error in archive process:', error);
    }
}

const CHECK_INTERVAL = process.env.INTERVAL_CHECK * 60 * 1000; // 1 minutes in milliseconds

// Schedule regular checks
setInterval(processNewTickets, CHECK_INTERVAL);

// Schedule archive process to run on Monday
scheduleArchiveOnMonday();

// Initial checks
processNewTickets();
