const fs = require('fs');
const path = require('path');
const glob = require('glob');

const submissionsDir = path.join(__dirname, '../submissions');
// Use noon UTC to avoid timezone shifts to previous day
const acceptedDate = "2025-11-24T12:00:00.000Z";
const ibmDate = "2023-09-06T12:00:00.000Z";
const sherbrookeDate = "2024-09-27T12:00:00.000Z";

glob(path.join(submissionsDir, '**/benchmark.json'), (err, files) => {
    if (err) {
        console.error("Error finding files:", err);
        return;
    }

    files.forEach(file => {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const json = JSON.parse(content);

            // Update acceptedDate
            json.acceptedDate = acceptedDate;

            // Fix IBM timestamps to noon UTC to avoid off-by-one display
            if (json.device && json.device.includes("IBM")) {
                if (json.device.includes("Sherbrooke")) {
                    json.timestamp = sherbrookeDate;
                } else {
                    // Only update if it's one of the ones we want to force to 9/6/2023
                    // (which is all of them except Sherbrooke according to user)
                    json.timestamp = ibmDate;
                }
            }

            fs.writeFileSync(file, JSON.stringify(json, null, 2));
            console.log(`Updated ${file}`);
        } catch (e) {
            console.error(`Error processing ${file}:`, e);
        }
    });
});
