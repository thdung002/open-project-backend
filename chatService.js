const axios = require('axios');
const { getAccessToken } = require('./authHelper');
require('dotenv').config();

// Function to post a new chat message
async function postNotifyMessage(workPackage) {
    try {
        const token = await getAccessToken();

        const openProjectUrl = `${process.env.OPENPROJECT_URL}/projects/${workPackage._embedded?.project?.identifier}/work_packages/${workPackage.id}`;
        
        // Create simple message with HTML link
        const messageContent = `🎫 Work Package Created!\nID: #${workPackage.id}\nSubject: ${workPackage.subject}\nCreated: ${new Date(workPackage.createdAt).toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'Asia/Singapore'
        })}\n\n<a href="${openProjectUrl}">View in OpenProject</a>`;

        // Create the message payload with body.content structure
        const messagePayload = {
            body: {
                content: messageContent,
                contentType: "html"
            }
        };


        // Post a new message in Teams chat
        const response = await axios.post(
            `https://graph.microsoft.com/v1.0/chats/${workPackage.chatID}/messages`,
            messagePayload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (error) {
        console.error('Error posting chat message:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        throw error;
    }
}

module.exports = {
    postNotifyMessage
};
