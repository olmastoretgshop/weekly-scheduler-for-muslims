// src/generateSchedulePDF.js
const PDFDocument = require('pdfkit');
const moment = require('moment');
const fs = require('fs');

function generateSchedulePDF(scheduleData) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData);
        });

        // Group schedule data by date
        const scheduleByDate = {};
        scheduleData.forEach(item => {
            if (!scheduleByDate[item.date]) {
                scheduleByDate[item.date] = [];
            }
            scheduleByDate[item.date].push(item);
        });

        // Sort dates
        const dates = Object.keys(scheduleByDate).sort((a, b) => {
            const dateA = moment(a, 'D/MM/YYYY');
            const dateB = moment(b, 'D/MM/YYYY');
            return dateA - dateB;
        });

        doc.fontSize(18).text('Weekly Schedule', { align: 'center' });
        doc.moveDown();

        // Define time slots
        const timeSlots = [];
        for (let h = 0; h < 24; h++) {
            timeSlots.push(`${String(h).padStart(2, '0')}:00`);
            timeSlots.push(`${String(h).padStart(2, '0')}:30`);
        }

        // Create table headers
        doc.fontSize(12);
        let x = doc.x;
        let y = doc.y;

        doc.text('Time', x, y, { continued: true, width: 60, align: 'center' });
        dates.forEach(date => {
            doc.text(moment(date, 'D/MM/YYYY').format('D MMMM'), { continued: true, width: 100, align: 'center' });
        });
        doc.moveDown();

        // Create table rows
        timeSlots.forEach(time => {
            doc.text(time, x, y += 20, { continued: true, width: 60, align: 'center' });
            dates.forEach(date => {
                const activity = scheduleByDate[date].find(item => item.time === time);
                if (activity) {
                    doc.text(`${activity.activity} (${activity.duration} min)`, { continued: true, width: 100, align: 'center' });
                } else {
                    doc.text('', { continued: true, width: 100, align: 'center' });
                }
            });
            doc.moveDown();
        });

        doc.end();
    });
}

module.exports = { generateSchedulePDF };

