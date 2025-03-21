const axios = require('axios');
require('dotenv').config();

let cachedToken = null;
let tokenExpiryTime = null;

async function getClientCredentialsToken() {
    const tokenUrl = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
    const response = await axios.post(tokenUrl,
        new URLSearchParams({
            client_id: process.env.MICROSOFT_CLIENT_ID,
            client_secret: process.env.MICROSOFT_CLIENT_SECRET,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials'
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    return response.data;
}

async function getAccessToken() {
    try {
        // Check if we have a valid cached token
        if (cachedToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
            return cachedToken;
        }

        // Get new token using client credentials
        const tokenResponse = await getClientCredentialsToken();

        // Cache the token
        cachedToken = tokenResponse.access_token;
        tokenExpiryTime = Date.now() + (tokenResponse.expires_in * 1000);

        return cachedToken;
    } catch (error) {
        console.error('\n❌ Error getting access token:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Response:', error.response.data);
        } else if (error.request) {
            console.error('No response received from Microsoft Graph API');
            console.error(error.request);
        } else {
            console.error('Error:', error.message);
        }
        throw error;
    }
}

// Helper function to get drive by ID
async function getDriveId() {
    try {
        const token = await getAccessToken();
        
        // Get the specific drive using the configured drive ID
        const driveId = process.env.MICROSOFT_DRIVE_ID;
        if (!driveId) {
            throw new Error('MICROSOFT_DRIVE_ID not set in environment variables');
        }

        const response = await axios.get(
            `https://graph.microsoft.com/v1.0/drives/${driveId}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.data || !response.data.id) {
            throw new Error('Drive ID not found in the response');
        }

        console.log('✅ Found Drive:', response.data.name, '(ID:', response.data.id + ')');
        return response.data.id;
    } catch (error) {
        console.error('\n❌ Error getting drive ID:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Response:', error.response.data);
            if (error.response.status === 401) {
                console.error('\nTip: Your application might not have sufficient permissions.');
            }
        } else if (error.request) {
            console.error('No response received from Microsoft Graph API');
            console.error(error.request);
        } else {
            console.error('Error:', error.message);
        }
        throw error;
    }
}

module.exports = { getAccessToken, getDriveId };