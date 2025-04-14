const axios = require('axios');
require('dotenv').config();

let cachedToken = null;
let tokenExpiryTime = null;

async function getAccessToken() {
    try {
        // Check if we have a valid cached token
        if (cachedToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
            return cachedToken;
        }

        // Get new token using client credentials with delegated permissions
        const tokenUrl = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
        const response = await axios.post(tokenUrl,
            new URLSearchParams({
                client_id: process.env.MICROSOFT_CLIENT_ID,
                client_secret: process.env.MICROSOFT_CLIENT_SECRET,
                scope: 'https://graph.microsoft.com/Files.ReadWrite.All offline_access',
                grant_type: 'password',
                username: process.env.MICROSOFT_USER_EMAIL,
                password: process.env.MICROSOFT_USER_PASSWORD
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        // Cache the token
        cachedToken = response.data.access_token;
        tokenExpiryTime = Date.now() + (response.data.expires_in * 1000);

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

// Helper function to get user's OneDrive
async function getDriveId() {
    try {
        const token = await getAccessToken();
        
        // Get the user's OneDrive
        const response = await axios.get(
            'https://graph.microsoft.com/v1.0/me/drive',
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

        // console.log('✅ Found Drive:', response.data.name, '(ID:', response.data.id + ')');
        return response.data.id;
    } catch (error) {
        console.error('\n❌ Error getting drive ID:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Response:', error.response.data);
            if (error.response.status === 401) {
                console.error('\nTip: Your token might be invalid or expired. Try authenticating again.');
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