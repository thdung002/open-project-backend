const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const BASE_URL = process.env.OPENPROJECT_URL;
const DATA_DIR = path.join(__dirname, "./json"); // Directory for partitioned data

const AUTH_HEADER = {
    headers: {
        Authorization: "Basic " + Buffer.from(`apikey:${process.env.OPENPROJECT_TOKEN}`).toString("base64"),
        "Content-Type": "application/json"
    }
};
let cachedData = null; // Start as null to detect first-run properly
// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Function to save data to a specific file
const saveToFile = (fileName, data) => {
    try {
        const filePath = path.join(DATA_DIR, fileName);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
        console.log(`💾 Data saved to ${fileName}`);
    } catch (error) {
        console.error(`❌ Error saving ${fileName}:`, error);
    }
};

// Function to load data from a specific file
const loadFromFile = (fileName) => {
    const filePath = path.join(DATA_DIR, fileName);
    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath, "utf8");
            return JSON.parse(content);
        } catch (error) {
            console.error(`❌ Error reading ${fileName}:`, error);
        }
    }
    return null;
};


// Optimized function to fetch all paginated data
const fetchAllData = async (endpoint) => {
    try {
        let results = [];
        let pageSize = 100; // Max records per request
        let offset = 1;
        let total = null; // Store total count from API

        while (true) {
            console.log(`🔄 Fetching ${endpoint} - Offset: ${offset}, PageSize: ${pageSize}`);

            const response = await axios.get(`${BASE_URL}/${endpoint}?offset=${offset}&pageSize=${pageSize}`,AUTH_HEADER);

            if (response.data._embedded && response.data._embedded.elements.length > 0) {
                results.push(...response.data._embedded.elements); // Append new data
            } else {
                console.log(`🚨 No more data found for ${endpoint}, stopping.`);
                break; // Stop if no more elements
            }

            // Get total count from the first request
            if (total === null) {
                total = response.data.total;
                console.log(`📊 Total records for ${endpoint}: ${total}`);
            }

            console.log(`✅ Fetched ${endpoint} so far: ${results.length} / ${total}`);

            if (results.length >= total) break; // Stop if all records are retrieved

            offset += 1; // Increase offset for the next batch
        }

        console.log(`✅ Fully fetched ${results.length} ${endpoint} records`);
        return results;
    } catch (error) {
        console.error(`❌ Error fetching ${endpoint}:`, error.response?.data || error.message);
        return [];
    }
};
// Fetch all data and store in memory
const loadData = async () => {
    try {
        console.log("🔄 Fetching fresh data from OpenProject...");

        const datasets = {
            projects: await fetchAllData("projects"),
            priorities: await fetchAllData("priorities"),
            types: await fetchAllData("types"),
            statuses: await fetchAllData("statuses")
        };

        Object.entries(datasets).forEach(([key, value]) => {
            const formattedData = Object.fromEntries(value.map(item => [item.name, item.id]));
            saveToFile(`${key}.json`, formattedData);
        });
        saveToFile('users.json', DEFAULT_USERS)
        console.log("✅ Data Loaded Successfully");
    } catch (error) {
        console.error("❌ Error loading data:", error.response?.data || error.message);
    }
};

// Default users data
const DEFAULT_USERS = {
    "Nhi Dam Ngoc Yen": 123,
    "Nhan Nguyen Gia Ai": 138,
    "Hanh Tran": 7,
    "Hendry Ding": 6,
    "Thong Lu": 5,
    "Phuoc Tran Tan": 81
};

// First-run check: If `cachedData` is null, fetch data immediately
const initializeData = async () => {
    const categories = ["projects", "users", "priorities", "types", "statuses"];
    let missingData = false;

    categories.forEach(category => {
        if (!fs.existsSync(path.join(DATA_DIR, `${category}.json`))) {
            console.log(`⚠️ Missing ${category}.json, fetching fresh data...`);
            missingData = true;
        }
    });

    if (missingData) {
        await loadData();
    }
};

// Run fetch every 24 hours
setInterval(loadData, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

// Function to get cached data
const getData = (category, name) => {
    const data = loadFromFile(`${category}.json`);
    return data?.[name] || null;
};

// Start initialization process
initializeData();

// Export functions
module.exports = { getData };
