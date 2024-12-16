// src/generateScheduleImages.js
const nodeHtmlToImage = require('node-html-to-image');
const path = require('path');
const moment = require('moment');

async function generateScheduleImage(scheduleData) {
    // Group schedule data by date
    const scheduleByDate = {};
    scheduleData.forEach(item => {
        if (!scheduleByDate[item.date]) {
            scheduleByDate[item.date] = [];
        }
        scheduleByDate[item.date].push(item);
    });

    // Create HTML structure
    let html = `
    <html>
    <head>
        <style>
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th, td {
                border: 1px solid #000;
                padding: 5px;
                text-align: center;
            }
            th {
                background-color: #f2f2f2;
            }
        </style>
    </head>
    <body>
        <table>
            <tr>
                <th>Time</th>
    `;

    // Get unique dates and sort them
    const dates = Object.keys(scheduleByDate).sort((a, b) => {
        const dateA = moment(a, 'D/MM/YYYY');
        const dateB = moment(b, 'D/MM/YYYY');
        return dateA - dateB;
    });

    dates.forEach(date => {
        html += `<th>${moment(date, 'D/MM/YYYY').format('D MMMM')}</th>`;
    });

    html += `</tr>`;

    // Define time slots
    const timeSlots = [];
    for (let h = 0; h < 24; h++) {
        timeSlots.push(`${String(h).padStart(2, '0')}:00`);
        timeSlots.push(`${String(h).padStart(2, '0')}:30`);
    }

    // Populate table
    timeSlots.forEach(time => {
        html += `<tr><td>${time}</td>`;
        dates.forEach(date => {
            const activity = scheduleByDate[date].find(item => item.time === time);
            if (activity) {
                html += `<td>${activity.activity} (${activity.duration} min)</td>`;
            } else {
                html += `<td></td>`;
            }
        });
        html += `</tr>`;
    });

    html += `
        </table>
    </body>
    </html>
    `;

    // Generate image
    const image = await nodeHtmlToImage({
        html: html,
        type: 'png',
        encoding: 'buffer',
        puppeteerArgs: { defaultViewport: { width: 1200, height: 800 } }
    });

    return image;
}

module.exports = { generateScheduleImage };