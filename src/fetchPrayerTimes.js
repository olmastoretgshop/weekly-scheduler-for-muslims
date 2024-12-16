// src/fetchPrayerTimes.js
const axios = require('axios');
const cheerio = require('cheerio');

async function fetchPrayerTimes() {
    try {
        const { data } = await axios.get('https://namozvaqti.uz/oylik/12/toshkent');
        const $ = cheerio.load(data);
        const prayerTimes = [];

        // Select the table rows excluding the header
        $('table.table_calendar tbody tr').each((index, element) => {
            if (index === 0) return; // Skip header row
            const tds = $(element).find('td');
            const dayWithSuffix = $(tds[0]).text().trim();
            const dayNumber = parseInt(dayWithSuffix, 10);
            const times = [];
            for (let i = 1; i <= 6; i++) {
                times.push($(tds[i]).text().trim());
            }
            const number = $(tds[7]).text().trim();
            prayerTimes.push({
                day: dayNumber,
                times: times, // [Bomdod, Quyosh, Peshin, Asr, Shom, Xufton]
                number: number
            });
        });

        return prayerTimes;
    } catch (error) {
        console.error('Error fetching prayer times:', error.message);
        return [];
    }
}

module.exports = fetchPrayerTimes;