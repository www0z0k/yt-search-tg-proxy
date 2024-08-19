const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const os = require('os');

// Load the locale file
const locale = JSON.parse(fs.readFileSync('locale.json')).ru;

let token = JSON.parse(fs.readFileSync('config.json')).tokentest;
// use real on linux
if (os.platform() === 'linux') {
    token = JSON.parse(fs.readFileSync('config.json')).token;
}


const bot = new TelegramBot(token, { polling: true });

const getDownloadLinksFromTips = (url) => {
    return [
        url.replace('youtube', 'youtubepp'),
        url.replace('youtube', 'pwnyoutube'),
    ];
}

const getMirrorLinks = (url) => {
    return [
        url.replace('youtube.com', 'yewtu.be'),
        url.replace('youtube', 'inv.nadeko.net'),
        url.replace('youtube', 'invidious.nerdvpn.de'),
    ];
}

const timeTranslations = {
    "Gestreamd:": "Streamed:",
    "geleden": "ago",
    "dagen": "days",
    "uur": "hours",
    "minuten": "minutes",
    "seconden": "seconds",
    "maand": "month",
    "maanden": "months",
    "jaar": "year",
    "jaren": "years",
    "week": "week",
    "weken": "weeks",
};

const translateTimePhrase = (phrase, dictionary) => {
    return phrase?.split(' ')?.map(word => dictionary[word] || word).join(' ') || phrase; 
};

// Custom keyboard with menu options
const menuKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: '📋 Start' }, { text: '❓ Help' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
    }
};

// Handle /start and Start button
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    console.log('Received message:', text, 'from chatId:', chatId);

    if (text.startsWith('📋 Start') || text.startsWith('/start')) {
        bot.sendMessage(chatId, `${locale.welcome}\n\n${locale.about}`, menuKeyboard);
        return;
    } else if (text.startsWith('❓ Help')) {
        bot.sendMessage(chatId, locale.help, menuKeyboard);
        return;
    } else {
        let query = text.trim();
        let numResults = chatId < 0 ? 1 : 10; // default number of results

        // Check if the query ends with =N, which specifies the number of results
        const match = query.match(/=(\d+)$/);
        if (match) {
            numResults = parseInt(match[1], 10);
            query = query.slice(0, match.index).trim(); // remove the =N from the query
        }

        getListDesc(query).then(videos => {
            if (videos) {
                videos.slice(0, numResults).forEach(v => {
                    const messageText = `${v.title}\n${translateTimePhrase(v.publishDateTime, timeTranslations) || ''}\nСсылка на само видео:\n${v.url}\n\nВозможные ссылки для скачивания:\n${getDownloadLinksFromTips(v.url).join('\n')}\nВозможные зеркала для онлайн просмотра${getMirrorLinks(v.url).join('\n')}\n\n${locale.shortDesc}`;
                    bot.sendMessage(chatId, messageText, menuKeyboard);
                });
            } else {
                bot.sendMessage(chatId, locale.error, menuKeyboard);
            }
        });
    }
});

// Handle inline queries
bot.on('inline_query', (query) => {
    const queryText = query.query.trim();

    if (queryText.startsWith('/help')) {
        bot.answerInlineQuery(query.id, [{
            type: 'article',
            id: 'help',
            title: 'Help',
            input_message_content: {
                message_text: locale.help
            }
        }]);
        return;
    }

    let queryTextWithoutResults = queryText;
    let numResults = 1; // Default to 1 result in inline mode

    // Check if the query ends with =N, which specifies the number of results
    const match = queryText.match(/=(\d+)$/);
    if (match) {
        numResults = parseInt(match[1], 10);
        queryTextWithoutResults = queryText.slice(0, match.index).trim(); // remove the =N from the query
    }

    getListDesc(queryTextWithoutResults).then(videos => {
        const results = videos.slice(0, numResults).map((v, index) => ({
            type: 'article',
            id: String(index),
            title: v.title,
            description: translateTimePhrase(v.publishDateTime, timeTranslations) || '',
            input_message_content: {
                message_text: `${v.title}\n${translateTimePhrase(v.publishDateTime, timeTranslations) || ''}\nСсылка на само видео:\n${v.url}\n\nВозможные ссылки для скачивания:\n${getDownloadLinksFromTips(v.url).join('\n')}\n\n${locale.shortDesc}`
            }
        }));
        bot.answerInlineQuery(query.id, results);
    }).catch((err) => {
        console.error('Error handling inline query:', err);
    });
});

const base = 'https://www.youtube.com/results?sp=CAI%3D&search_query=';

const getListDesc = async (q) => {
    try {
        const response = await fetch(base + encodeURIComponent(q));
        const html = await response.text();

        const ytInitialDataMatch = html.match(/var ytInitialData = ({.*?});/s);

        if (ytInitialDataMatch && ytInitialDataMatch[1]) {
            const jsonString = ytInitialDataMatch[1];
            const ytInitialData = JSON.parse(jsonString);

            const videoRenderers = getObjectFieldFromAnyDepth(ytInitialData, 'videoRenderer');

            const videos = videoRenderers.map(v => {
                let publishDateTime = null;
                const when = getObjectFieldFromAnyDepth(v, 'publishedTimeText');
                if (when.length && when[0].value?.simpleText) {
                    publishDateTime = when[0].value.simpleText;
                }
                return { url: 'https://www.youtube.com/watch?v=' + v.value.videoId, title: v.value.title.runs[0].text, publishDateTime };
            });
            return videos;
        } else {
            console.error('Could not find ytInitialData in HTML');
            return null;
        }
    } catch (error) {
        console.error('Error scraping YouTube:', error.message);
        return null;
    }
};

const getObjectFieldFromAnyDepth = (obj, field) => {
    const result = [];
    const innerGet = (obj, field, path = '') => {
        if (obj[field]) {
            return obj[field];
        } else {
            for (const key in obj) {
                if (typeof obj[key] === 'object' || Array.isArray(obj[key])) {
                    const res = innerGet(obj[key], field, path + key + '.');
                    if (res) {
                        result.push({ path: path + key, value: res });
                    }
                }
            }
        }
    }
    innerGet(obj, field);
    return result;
}
