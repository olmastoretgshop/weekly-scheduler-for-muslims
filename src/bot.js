// src/bot.js
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fetchPrayerTimes = require('./fetchPrayerTimes');
const db = require('./database');
const { generateScheduleImage } = require('./generateScheduleImage');
const { generateSchedulePDF } = require('./generateSchedulePDF');
const moment = require('moment');
const axios = require('axios');
const cheerio = require('cheerio');
const nodeHtmlToImage = require('node-html-to-image');
const PDFDocument = require('pdfkit');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Helper function to check if user exists
const getUser = (userId) => {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
};

// Helper function to add user
const addUser = (userId, isMuslim) => {
    return new Promise((resolve, reject) => {
        db.run(`INSERT OR IGNORE INTO users (user_id, is_muslim) VALUES (?, ?)`, [userId, isMuslim], function(err) {
            if (err) reject(err);
            resolve(this.lastID);
        });
    });
};

// Function to map index to prayer name
const getPrayerName = (index) => {
    const prayers = ['Bomdod', 'Quyosh', 'Peshin', 'Asr', 'Shom', 'Xufton'];
    return prayers[index] || 'Unknown Prayer';
};

// Start command
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId);

    if (!user) {
        ctx.reply('Salom! Siz musulmonmisiz?', Markup.inlineKeyboard([
            [Markup.button.callback('Ha', 'IS_MUSLIM_YES')],
            [Markup.button.callback('Yo‘q', 'IS_MUSLIM_NO')]
        ]));
    } else {
        if (user.is_muslim) {
            ctx.reply('Xush kelibsiz! Jadvalingizga kirishingiz mumkin.', mainMenu());
        } else {
            ctx.reply('Bot faqat musulmon foydalanuvchilar uchun mo‘ljallangan.');
        }
    }
});

// Handle Muslim confirmation
bot.action('IS_MUSLIM_YES', async (ctx) => {
    const userId = ctx.from.id;
    await addUser(userId, true);
    ctx.reply('Ajoyib! Jadvalingizni yaratish uchun quyidagilarni tanlang:', mainMenu());
});

bot.action('IS_MUSLIM_NO', (ctx) => {
    const userId = ctx.from.id;
    addUser(userId, false).then(() => {
        ctx.reply('Bot faqat musulmon foydalanuvchilar uchun mo‘ljallangan.');
    }).catch(err => {
        console.error(err);
        ctx.reply('Xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko‘ring.');
    });
});

// Main menu
const mainMenu = () => {
    return Markup.keyboard([
        ['📅 Schedule Options']
    ]).resize();
};

// Handle schedule options
bot.hears('📅 Schedule Options', (ctx) => {
    ctx.reply('Quyidagi variantlardan birini tanlang:', Markup.inlineKeyboard([
        [Markup.button.callback('Build my Schedule', 'BUILD_SCHEDULE')],
        [Markup.button.callback('Edit Schedule', 'EDIT_SCHEDULE')],
        [Markup.button.callback('Delete Schedule', 'DELETE_SCHEDULE')],
        [Markup.button.callback('Export Schedule', 'EXPORT_SCHEDULE')]
    ]));
});

// Handle Build Schedule
bot.action('BUILD_SCHEDULE', async (ctx) => {
    const userId = ctx.from.id;
    // Fetch prayer times
    const prayerTimes = await fetchPrayerTimes();

    if (prayerTimes.length === 0) {
        ctx.reply('Prayer times could not be fetched. Please try again later.');
        return;
    }

    // Clear existing schedule for the user
    db.run(`DELETE FROM schedules WHERE user_id = ?`, [userId], function(err) {
        if (err) {
            console.error('Error clearing existing schedule:', err.message);
        }
    });

    // Iterate over each day and insert prayer times
    prayerTimes.forEach(dayData => {
        const { day, times } = dayData;
        // Assuming dates are in December 2024
        const date = `1/12/2024`; // Initialize with default date format
        let actualDate;
        // JavaScript months are 0-based, December is 11
        actualDate = moment(`2024-12-${day}`, 'YYYY-MM-DD').format('D/MM/YYYY');
        const dayOfWeek = moment(`2024-12-${day}`, 'YYYY-MM-DD').format('dddd'); // Get day of the week

        times.forEach((time, index) => {
            // Round start time down to nearest 30 minutes
            const [hour, minute] = time.split(':').map(Number);
            let roundedStartHour = hour;
            let roundedStartMinute = minute < 30 ? 0 : 30;

            // Create start time
            const startTime = `${String(roundedStartHour).padStart(2, '0')}:${String(roundedStartMinute).padStart(2, '0')}`;
            const activityName = getPrayerName(index); // Function to map index to prayer name
            const description = `Starts at ${time}`;

            // Calculate end time by adding 30 minutes
            const roundedStart = moment(`${roundedStartHour}:${roundedStartMinute}`, 'HH:mm');
            const endMoment = roundedStart.clone().add(30, 'minutes');
            // Round end time up to the nearest hour if needed
            const endTime = endMoment.minutes() === 0 ? endMoment.format('HH:mm') : endMoment.minutes() < 30 ? endMoment.clone().set({ 'minutes': 30 }).format('HH:mm') : endMoment.clone().add(1, 'hour').format('HH:mm');

            // Insert into database
            db.run(`
                INSERT INTO schedules (user_id, date, day_of_week, time, activity, duration, frequency)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [userId, date, dayOfWeek, startTime, `${activityName} (${description})`, 30, 'Daily'], function(err) {
                if (err) {
                    console.error('Error inserting prayer time:', err.message);
                }
            });
        });
    });

    ctx.reply('Jadvalingiz yaratildi!', mainMenu());
});

// Handle Edit Schedule
bot.action('EDIT_SCHEDULE', async (ctx) => {
    const userId = ctx.from.id;
    // Check if user has a schedule
    db.get(`SELECT * FROM schedules WHERE user_id = ?`, [userId], (err, row) => {
        if (err) {
            console.error(err);
            ctx.reply('Xatolik yuz berdi.');
            return;
        }
        if (!row) {
            ctx.reply('Hozircha jadvalingiz yo‘q. Jadval yaratish uchun "Build my Schedule" ni tanlang.');
        } else {
            ctx.reply('Jadvalingizni tahrirlash uchun quyidagi variantlardan birini tanlang:', Markup.inlineKeyboard([
                [Markup.button.callback('Add Activity', 'ADD_ACTIVITY')],
                [Markup.button.callback('Edit Activity', 'EDIT_ACTIVITY')],
                [Markup.button.callback('Delete Activity', 'DELETE_ACTIVITY')],
                [Markup.button.callback('Go Back', 'GO_BACK')]
            ]));
        }
    });
});

// Handle Delete Schedule
bot.action('DELETE_SCHEDULE', async (ctx) => {
    const userId = ctx.from.id;
    db.run(`DELETE FROM schedules WHERE user_id = ?`, [userId], function(err) {
        if (err) {
            console.error(err);
            ctx.reply('Xatolik yuz berdi.');
        } else {
            ctx.reply('Jadvalingiz muvaffaqiyatli o‘chirildi.', mainMenu());
        }
    });
});

// Handle Export Schedule
bot.action('EXPORT_SCHEDULE', async (ctx) => {
    const userId = ctx.from.id;
    // Fetch schedule from database
    db.all(`SELECT * FROM schedules WHERE user_id = ? ORDER BY time ASC`, [userId], async (err, rows) => {
        if (err) {
            console.error(err);
            ctx.reply('Xatolik yuz berdi.');
            return;
        }
        if (rows.length === 0) {
            ctx.reply('Jadvalingiz hali to‘liq emas.');
            return;
        }

        // Generate Image and PDF
        try {
            const imageBuffer = await require('./generateScheduleImages')(rows);
            const pdfBuffer = await require('./generateSchedulePDF')(rows);

            // Send files to user
            ctx.replyWithPhoto({ source: imageBuffer }, { caption: 'Jadval rasmi' });
            ctx.replyWithDocument({ source: pdfBuffer, filename: 'schedule.pdf' }, { caption: 'Jadval PDF' });
        } catch (error) {
            console.error('Error generating export files:', error.message);
            ctx.reply('Jadvalni eksport qilishda xatolik yuz berdi.');
        }
    });
});

// Handle Go Back
bot.action('GO_BACK', (ctx) => {
    ctx.reply('Quyidagi variantlardan birini tanlang:', mainMenu());
});

// Launch the bot
bot.launch().then(() => console.log('Bot is running...')).catch(err => console.error('Error launching bot:', err));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Handle Add Activity
bot.action('ADD_ACTIVITY', (ctx) => {
    ctx.reply('Aktivlik vaqtini tanlang:', Markup.keyboard([
        ['00:00', '00:30'], ['01:00', '01:30'], ['02:00', '02:30'],
        ['03:00', '03:30'], ['04:00', '04:30'], ['05:00', '05:30'],
        ['06:00', '06:30'], ['07:00', '07:30'], ['08:00', '08:30'],
        ['09:00', '09:30'], ['10:00', '10:30'], ['11:00', '11:30'],
        ['12:00', '12:30'], ['13:00', '13:30'], ['14:00', '14:30'],
        ['15:00', '15:30'], ['16:00', '16:30'], ['17:00', '17:30'],
        ['18:00', '18:30'], ['19:00', '19:30'], ['20:00', '20:30'],
        ['21:00', '21:30'], ['22:00', '22:30'], ['23:00', '23:30'],
    ]).resize());
    ctx.session = { stage: 'awaiting_time' };
});

// Listen for time selection
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (ctx.session && ctx.session.stage === 'awaiting_time') {
        ctx.session.selectedTime = text;
        ctx.reply('Aktivlik nomini kiriting:');
        ctx.session.stage = 'awaiting_activity_name';
    } else if (ctx.session && ctx.session.stage === 'awaiting_activity_name') {
        ctx.session.activityName = text;
        ctx.reply('Aktivlik davomiyligini tanlang (10, 20, 30, ..., 1440 daqiqa):', Markup.keyboard([
            ['10 minutes'], ['20 minutes'], ['30 minutes'], ['40 minutes'],
            ['50 minutes'], ['60 minutes'], ['70 minutes'], ['80 minutes'],
            ['90 minutes'], ['100 minutes'], ['110 minutes'], ['120 minutes'],
            // Add more as needed up to 1440
        ]).resize());
        ctx.session.stage = 'awaiting_duration';
    } else if (ctx.session && ctx.session.stage === 'awaiting_duration') {
        const durationText = text;
        const duration = parseInt(durationText.split(' ')[0], 10);
        ctx.session.duration = duration;
        ctx.reply('Aktivlik chastotasini tanlang (Dushanba, Seshanba, ...):', Markup.inlineKeyboard([
            [Markup.button.callback('Monday', 'FREQ_MONDAY')],
            [Markup.button.callback('Tuesday', 'FREQ_TUESDAY')],
            [Markup.button.callback('Wednesday', 'FREQ_WEDNESDAY')],
            [Markup.button.callback('Thursday', 'FREQ_THURSDAY')],
            [Markup.button.callback('Friday', 'FREQ_FRIDAY')],
            [Markup.button.callback('Saturday', 'FREQ_SATURDAY')],
            [Markup.button.callback('Sunday', 'FREQ_SUNDAY')],
            [Markup.button.callback('Done', 'FREQ_DONE')]
        ]));
        ctx.session.frequency = [];
    } else if (ctx.session && ctx.session.stage === 'awaiting_frequency') {
        // Handled in action listeners below
    }
});

// Handle frequency selection
bot.action(/FREQ_(\w+)/, (ctx) => {
    const frequency = ctx.match[1].toLowerCase();
    if (frequency === 'done') {
        // Save the activity to the database
        const { selectedTime, activityName, duration, frequency: freqList } = ctx.session;
        const days = ctx.session.frequency.join(', ');
        
        // ??? smth ???
        const startTime = selectedTime;
        // Calculate end time
        const [startHour, startMinute] = selectedTime.split(':').map(Number);
        const endMoment = moment(`${startHour}:${startMinute}`, 'HH:mm').add(duration, 'minutes');
        const endTime = endMoment.format('HH:mm');

        // Fetch day of week from date headers (This assumes you have the dates stored; adjust accordingly)
        // For simplicity, assume frequency includes day names

        // Insert into database
        db.run(`
            INSERT INTO schedules (user_id, date, day_of_week, time, activity, duration, frequency)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [ctx.from.id, 'TBD', 'TBD', startTime, activityName, duration, days], function(err) {
            if (err) {
                console.error('Error inserting activity:', err.message);
                ctx.reply('Xatolik yuz berdi.');
            } else {
                ctx.reply('Aktivlik qo‘shildi!', Markup.inlineKeyboard([
                    [Markup.button.callback('Add Another Activity', 'ADD_ACTIVITY')],
                    [Markup.button.callback('Go Back', 'EDIT_SCHEDULE')]
                ]));
                ctx.session = null;
            }
        });
    } else {
        const day = mapToDay(frequency);
        if (day) {
            ctx.session.frequency.push(day);
            ctx.reply(`${day} qo‘shildi. `);
        }
        // Remain in frequency selection
    }
});

// Map frequency buttons to day names
const mapToDay = (freq) => {
    const mapping = {
        'MONDAY': 'Monday',
        'TUESDAY': 'Tuesday',
        'WEDNESDAY': 'Wednesday',
        'THURSDAY': 'Thursday',
        'FRIDAY': 'Friday',
        'SATURDAY': 'Saturday',
        'SUNDAY': 'Sunday'
    };
    return mapping[freq.toUpperCase()];
};

// Continuing in src/bot.js

// Handle Edit Activity
bot.action('EDIT_ACTIVITY', (ctx) => {
    const userId = ctx.from.id;
    db.all(`SELECT * FROM schedules WHERE user_id = ?`, [userId], (err, rows) => {
        if (err) {
            console.error(err);
            ctx.reply('Xatolik yuz berdi.');
            return;
        }
        if (rows.length === 0) {
            ctx.reply('Jadvalda faoliyat yo‘q.');
            return;
        }
        // List activities
        const buttons = rows.map(row => [Markup.button.callback(`${row.activity} at ${row.time}`, `EDIT_ACT_${row.schedule_id}`)]);
        buttons.push([Markup.button.callback('Go Back', 'EDIT_SCHEDULE')]);
        ctx.reply('Tahrirlash uchun faoliyatni tanlang:', Markup.inlineKeyboard(buttons));
    });
});

// Handle individual activity edit
bot.action(/EDIT_ACT_(\d+)/, (ctx) => {
    const scheduleId = ctx.match[1];
    db.get(`SELECT * FROM schedules WHERE schedule_id = ?`, [scheduleId], (err, row) => {
        if (err || !row) {
            console.error(err);
            ctx.reply('Aktiviyat topilmadi.');
            return;
        }
        // Show activity details and edit options
        ctx.reply(`**${row.activity}**
  
  ⏰ Boshlanish vaqti: ${row.time}
  🕒 Davomiyligi: ${row.duration} daqiqa
  📅 Chastotasi: ${row.frequency}`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('Edit Activity', `EDIT_DETAIL_${scheduleId}`)],
                [Markup.button.callback('Delete Activity', `DELETE_DETAIL_${scheduleId}`)],
                [Markup.button.callback('Go Back', 'EDIT_ACTIVITY')]
            ])
        });
    });
});

// Handle Delete Activity
bot.action(/DELETE_DETAIL_(\d+)/, (ctx) => {
    const scheduleId = ctx.match[1];
    db.run(`DELETE FROM schedules WHERE schedule_id = ?`, [scheduleId], function(err) {
        if (err) {
            console.error(err);
            ctx.reply('Xatolik yuz berdi.');
            return;
        }
        ctx.reply('Aktiviyat o‘chirildi.', Markup.inlineKeyboard([
            [Markup.button.callback('Edit Activity', 'EDIT_ACTIVITY')],
            [Markup.button.callback('Go Back', 'EDIT_SCHEDULE')]
        ]));
    });
});

// Handle Edit Activity Details
bot.action(/EDIT_DETAIL_(\d+)/, (ctx) => {
    const scheduleId = ctx.match[1];
    // Fetch activity details
    db.get(`SELECT * FROM schedules WHERE schedule_id = ?`, [scheduleId], (err, row) => {
        if (err || !row) {
            console.error(err);
            ctx.reply('Aktiviyat topilmadi.');
            return;
        }
        ctx.session = { scheduleId: scheduleId, stage: 'editing_activity' };
        ctx.reply('Nimani o‘zgartirmoqchisiz?', Markup.inlineKeyboard([
            [Markup.button.callback('Start Time', 'EDIT_START_TIME')],
            [Markup.button.callback('Duration', 'EDIT_DURATION')],
            [Markup.button.callback('Name', 'EDIT_NAME')],
            [Markup.button.callback('Frequency', 'EDIT_FREQUENCY')],
            [Markup.button.callback('Go Back', 'EDIT_ACT_' + scheduleId)]
        ]));
    });
});

// Handle specific edit actions
bot.action('EDIT_START_TIME', (ctx) => {
    ctx.reply('Yangi boshlanish vaqtini tanlang:', Markup.keyboard([
        ['00:00', '00:30'], ['01:00', '01:30'], ['02:00', '02:30'],
        ['03:00', '03:30'], ['04:00', '04:30'], ['05:00', '05:30'],
        ['06:00', '06:30'], ['07:00', '07:30'], ['08:00', '08:30'],
        ['09:00', '09:30'], ['10:00', '10:30'], ['11:00', '11:30'],
        ['12:00', '12:30'], ['13:00', '13:30'], ['14:00', '14:30'],
        ['15:00', '15:30'], ['16:00', '16:30'], ['17:00', '17:30'],
        ['18:00', '18:30'], ['19:00', '19:30'], ['20:00', '20:30'],
        ['21:00', '21:30'], ['22:00', '22:30'], ['23:00', '23:30'],
    ]).resize());
    ctx.session.editingField = 'time';
    ctx.session.stage = 'editing_activity_time';
});

bot.action('EDIT_DURATION', (ctx) => {
    ctx.reply('Yangi davomiylikni tanlang:', Markup.keyboard([
        ['10 minutes'], ['20 minutes'], ['30 minutes'], ['40 minutes'],
        ['50 minutes'], ['60 minutes'], ['70 minutes'], ['80 minutes'],
        ['90 minutes'], ['100 minutes'], ['110 minutes'], ['120 minutes'],
        // Add more as needed up to 1440
    ]).resize());
    ctx.session.editingField = 'duration';
    ctx.session.stage = 'editing_activity_duration';
});

bot.action('EDIT_NAME', (ctx) => {
    ctx.reply('Yangi aktivlik nomini kiriting:');
    ctx.session.editingField = 'name';
    ctx.session.stage = 'editing_activity_name';
});

bot.action('EDIT_FREQUENCY', (ctx) => {
    ctx.reply('Aktivlik chastotasini tanlang:', Markup.inlineKeyboard([
        [Markup.button.callback('Monday', 'FREQ_MONDAY_EDIT')],
        [Markup.button.callback('Tuesday', 'FREQ_TUESDAY_EDIT')],
        [Markup.button.callback('Wednesday', 'FREQ_WEDNESDAY_EDIT')],
        [Markup.button.callback('Thursday', 'FREQ_THURSDAY_EDIT')],
        [Markup.button.callback('Friday', 'FREQ_FRIDAY_EDIT')],
        [Markup.button.callback('Saturday', 'FREQ_SATURDAY_EDIT')],
        [Markup.button.callback('Sunday', 'FREQ_SUNDAY_EDIT')],
        [Markup.button.callback('Done', 'FREQ_DONE_EDIT')]
    ]));
    ctx.session.editingField = 'frequency';
    ctx.session.stage = 'editing_activity_frequency';
});

// Handle edited frequency selection
bot.action(/FREQ_(\w+)_EDIT/, (ctx) => {
    const frequency = ctx.match[1].toLowerCase();
    if (frequency === 'done') {
        // Save the updated frequency to the database
        const { scheduleId, frequencyList } = ctx.session;
        const days = ctx.session.frequency.join(', ');
        
        db.run(`
            UPDATE schedules SET frequency = ? WHERE schedule_id = ?
        `, [days, scheduleId], function(err) {
            if (err) {
                console.error('Error updating frequency:', err.message);
                ctx.reply('Xatolik yuz berdi.');
                return;
            }
            ctx.reply('Chastotangiz yangilandi.', Markup.inlineKeyboard([
                [Markup.button.callback('Go Back', 'EDIT_ACTIVITY')]
            ]));
            ctx.session = null;
        });
    } else {
        const day = mapToDay(frequency);
        if (day && !ctx.session.frequency.includes(day)) {
            ctx.session.frequency.push(day);
            ctx.reply(`${day} qo‘shildi.`);
        }
        // Remain in frequency selection
    }
});

// Handle text input for edited fields
bot.on('text', (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    const { stage, editingField, scheduleId } = ctx.session || {};

    if (stage === 'editing_activity_name') {
        db.run(`
            UPDATE schedules SET activity = ? WHERE schedule_id = ?
        `, [text, scheduleId], function(err) {
            if (err) {
                console.error('Error updating activity name:', err.message);
                ctx.reply('Xatolik yuz berdi.');
                return;
            }
            ctx.reply('Aktivlik nomi yangilandi.', Markup.inlineKeyboard([
                [Markup.button.callback('Go Back', 'EDIT_ACTIVITY')]
            ]));
            ctx.session = null;
        });
    } else if (stage === 'editing_activity_time') {
        db.run(`
            UPDATE schedules SET time = ? WHERE schedule_id = ?
        `, [text, scheduleId], function(err) {
            if (err) {
                console.error('Error updating time:', err.message);
                ctx.reply('Xatolik yuz berdi.');
                return;
            }
            ctx.reply('Boshlanish vaqti yangilandi.', Markup.inlineKeyboard([
                [Markup.button.callback('Go Back', 'EDIT_ACTIVITY')]
            ]));
            ctx.session = null;
        });
    } else if (stage === 'editing_activity_duration') {
        const duration = parseInt(text.split(' ')[0], 10);
        db.run(`
            UPDATE schedules SET duration = ? WHERE schedule_id = ?
        `, [duration, scheduleId], function(err) {
            if (err) {
                console.error('Error updating duration:', err.message);
                ctx.reply('Xatolik yuz berdi.');
                return;
            }
            ctx.reply('Davomiylik yangilandi.', Markup.inlineKeyboard([
                [Markup.button.callback('Go Back', 'EDIT_ACTIVITY')]
            ]));
            ctx.session = null;
        });
    }
});

