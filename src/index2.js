const { Client } = require('tdl')
const { TDLib } = require('tdl-tdlib-addon')
const express = require('express')
const cors = require('cors')
const FormData = require('form-data');
const fs = require('fs')
// const PDFDocument = require('pdfkit');
// const Mp32Wav = require('mp3-to-wav')
// const path = require('path');
// const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const bodyParser = require('body-parser')

const bot_token = '6023731895:AAGt3pOJN9W99pPcf2NLMUI-7lbFSc0lb40'


const convertMp3ToWav = async (input) => {
	let segments = input.split('/');

	let filename = segments[segments.length - 1];
	let extension = filename.split('.')[1];

	let name = filename.split('.')[0];

	let folder = input.replace(filename, '');
	let output = folder + name + '.wav';
	console.log("\Converting file %s", output)

	var ffmpeg = require('fluent-ffmpeg');
	var command = ffmpeg(input)
		.inputFormat('mp3')
		.audioCodec('pcm_s16le')
		.format('wav')
		.save(output)

	return output;
}


const convertFiles = (path, options) => {
	return new Promise((resolve, reject) => {

		// Load modules
		const fs = require('fs');

		// Is argument a file?
		if (fs.statSync(path).isFile()) {

			// mp3
			if (path.endsWith(options.from)) {
				let result = convertMp3ToWav(path, options);
				console.log(result);
				resolve()
			}

		}

		console.log('\nCrawling directory \'%s\'', path);

		// Search for all audio files in folder
		fs.readdir(path, (err, files) => {

			let readFolderActions = [];

			// Process all found files
			if (files) {
				files.forEach(file => {
					let filePath = path + '/' + file;
					let readItem = null;

					// is folder
					if (fs.statSync(filePath).isDirectory()) {
						readItem = convertFiles(filePath, options);
					}
					// Not folder
					else {
						// is PDF
						if (file.endsWith(options.from)) {
							convertMp3ToWav(filePath, options);
						}
					}

					readFolderActions.push(readItem);
				});
			} else {
				reject('Directorio %s not found.', path);
			}

			// Wait for all actions to be processed
			Promise.all(readFolderActions).then((results) => {
				resolve();
			})
		})
	});
}


const file_chatId = {};


const client = new Client(new TDLib(), {
    apiId: 25669410, // Your api_id
    apiHash: '94640055a4f717acd380fefe6f419021'
})
let userId = 0;

client.on('error', console.error)

async function listener(v){
    console.log('v:', v?._, v?.message?.chat_id)
    if(v?.message?.chat_id){
        userId = v.message.chat_id
    }
    if(v.message && v.message.sender_id.user_id === v.message.chat_id && v.message.content.audio) {
        const file = v.message.content.audio;
        console.log('file:', v.message.content);
        if(file) {
            try{
                await client.invoke({
                    _: 'downloadFile',
                    file_id: file.audio.id,
                    priority: 32,
                })
            } catch(err) {
                console.log('error:', err)
            }
        }
        await client.invoke({
            _: 'sendMessage',
            chat_id: parseInt(v.message.chat_id),
            input_message_content: {
                _: 'inputMessageText',
                text: {
                    _: 'formattedText',
                    text: 'Привет, зарузка твоего файла уже начата. Как только файл будет загружен, тебе придет оповещение'
                }
            }
        })
    }
    if(v.message && v.message.sender_id.user_id === v.message.chat_id && !v.message.content.audio) {
        await client.invoke({
            _: 'sendMessage',
            chat_id: v.message.chat_id,
            input_message_content: {
                _: 'inputMessageText',
                text: {
                    _: 'formattedText',
                    text: 'Приветствую в OllidBote. Пришли мне аудиофайл и я расшифрую тебе его!',
                }
            }
        })
    }
    if(v._ === 'updateFile') {
        const downloadFile = v.file;
        const file_format = downloadFile.local.path.split('/').slice(-1)[0].split('.').slice(-1)[0];
        if(downloadFile.local.is_downloading_completed && file_format !== 'pdf' && file_format !== 'txt'){
            const formData = new FormData();
            let path = downloadFile.local.path;
            formData.append('file', fs.createReadStream(path));
            formData.append('user', userId);
            try {
                const getFile = await axios.post(
                    "http://34.27.19.67:5000/getFile/",
                    // "http://127.0.0.1:8080/getFile/",
                    formData,
                    {
                        headers: {...formData.getHeaders()},
                    }
                )
                console.log('--------------getFile--------------:', getFile);
                await client.invoke({
                    _: 'sendMessage',
                    chat_id: parseInt(getFile.data.userId),
                    input_message_content: {
                        _: 'inputMessageText',
                        text: {
                            _: 'formattedText',
                            text: getFile.data.text,
                        }
                    }
                })
                console.log('sendedFile')
            } catch (e) {
                console.log(e, "getFileError")
            }
        }
    }
}

async function main() {
    await client.loginAsBot(bot_token);
    client.on('update', listener)
}

const app = express()
app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

const PORT = 3000;

app.post("/processedFile/", async function (request, response) {
    console.log('request:', request?.body?.results, response?.body?.results);
    if(!request.body) return response.sendStatus(400);
    console.log(request.body);
    let resultText = '';
    let time = '';
    let finalSpeaker = '';
    const chatId = request.body.userId
    const data = request.body.results
        .map(element => {
            const timing = [...element[0].slice(0, 5).split(':'), ...element[0].slice(6, element[0].length).split('.')]
            return [timing.map((resulTiming) => resulTiming.length === 1 ? `0${resulTiming}` : resulTiming).join(':'), element[1]]
        })
        .sort((a, b) => a[0] < b[0]? -1 : a[0] > b[0] ? 1 : 0)
    console.log('data:', data);
    let string = data.reduce((accumulator, item, index, array) => {
        time = item[0];
        const speaker = item[1].split(' ')[0];
        finalSpeaker = speaker;
        const text = item[1].slice(speaker.length, item[1].length)
        let prevSpeaker = '';
        if (index > 0) {
            prevSpeaker = array[index - 1][1].split(' ')[0];
        };
        if (prevSpeaker === '') {
            accumulator = `${time} - `
            resultText = `${resultText}${text}`
        } else {
            if (prevSpeaker === speaker) {
                resultText = `${resultText}${text}`
            } else {
                accumulator = `${accumulator}${time} ${prevSpeaker}${resultText} \n${time}  - `
                resultText = text;
                time = '';
            }
        }
        return accumulator;
    }, ['']);
    if(time !== '' && resultText !== '') {
        string = `${string}${time} ${finalSpeaker}${resultText}`
        resultText = '';
        time = '';
    }
    try {
        await client.invoke({
            _: 'sendMessage',
            chat_id: parseInt(chatId),
            input_message_content: {
                _: 'inputMessageText',
                text: {
                    _: 'formattedText',
                    text: string
                }
            }
        })
    } catch(e) {
        console.log('err:', e)
    }
    response.send(JSON.stringify({ status: 'ok' }));
});

app.listen(PORT, () => console.log("Сервер запущен, порт " + PORT));

main().catch(console.error)