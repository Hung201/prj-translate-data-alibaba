import express from 'express';
import fs from 'fs';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import path from 'path';
import axios from 'axios';

const app = express();
app.use(express.json());

const backupDir = 'backup_translations';
const apiUrl = 'https://api-translate.daisan.vn/translate/batch';
const BATCH_SIZE = 125;
const CONCURRENT_BATCHES = 7;
const limit = pLimit(CONCURRENT_BATCHES);

if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
    console.log(`Đã tạo thư mục ${backupDir}`);
}

function generateOutputFileName() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    return `data_alibaba_translated_${timestamp}.json`;
}

async function translateBatch(texts) {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            texts,
            target_lang: 'vi',
            source_lang: 'auto'
        })
    });
    if (!response.ok) {
        throw new Error(`API error: ${response.status} - ${await response.text()}`);
    }
    const data = await response.json();
    return data.translated_texts;
}

function extractTextNodesFromContent(data) {
    let allTextNodes = [];
    let nodeRefs = [];
    let cheerioObjs = [];
    data.forEach((item, itemIdx) => {
        if (item.content) {
            const $ = cheerio.load(item.content, {
                decodeEntities: false,
                // xmlMode: false,
                _useHtmlParser2: true,
                lowerCaseTags: false,
                lowerCaseAttributeNames: false,
                recognizeSelfClosing: true
            });

            // let styleContent = '';
            // $('style').each(function () {
            //     styleContent += $(this).html();
            //     $(this).remove();
            // });

            // $('html').each(function () {
            //     $(this).replaceWith($(this).html());
            // });
            // $('head').each(function () {
            //     $(this).replaceWith($(this).html());
            // });
            // $('body').each(function () {
            //     $(this).replaceWith($(this).html());
            // });

            // cheerioObjs[itemIdx] = {
            //     $: $,
            //     style: styleContent
            // };

            let nodeIdx = 0;
            function collectTextNodes(node) {
                if (node.type === 'text' && node.data.trim()) {
                    allTextNodes.push(node.data);
                    nodeRefs.push({ itemIdx, nodeIdx });
                    nodeIdx++;
                } else if (node.children && node.children.length) {
                    for (let child of node.children) {
                        collectTextNodes(child);
                    }
                }
            }
            for (let node of $.root().children()) {
                collectTextNodes(node);
            }
        }
    });
    return { allTextNodes, nodeRefs, cheerioObjs };
}

app.post('/translate', async (req, res) => {
    const apifyUrl = req.body.url || req.query.url;
    if (!apifyUrl) {
        return res.status(400).json({ error: 'Thiếu url Apify' });
    }
    try {
        const data = await fetchApifyDataByUrl(apifyUrl);
        const titles = data.map(item => item.title);
        let translatedTitles = [];
        translatedTitles = await translateBatch(titles);
        data.forEach((item, i) => {
            item.title = translatedTitles[i] || item.title;
        });
        const { allTextNodes, nodeRefs, cheerioObjs } = extractTextNodesFromContent(data);
        let translatedTextNodes = [];
        if (allTextNodes.length > 0) {
            const batches = [];
            for (let i = 0; i < allTextNodes.length; i += BATCH_SIZE) {
                batches.push(allTextNodes.slice(i, i + BATCH_SIZE));
            }
            const promises = batches.map(batch => limit(() => translateBatch(batch)));
            const results = await Promise.all(promises);
            translatedTextNodes = results.flat();
            let nodeIdxMap = {};
            nodeRefs.forEach((ref, idx) => {
                if (!nodeIdxMap[ref.itemIdx]) nodeIdxMap[ref.itemIdx] = [];
                nodeIdxMap[ref.itemIdx].push({ idx, text: translatedTextNodes[idx] });
            });
            data.forEach((item, itemIdx) => {
                if (item.content && cheerioObjs[itemIdx]) {
                    const { $, style } = cheerioObjs[itemIdx];
                    let textNodeIdx = 0;
                    function replaceTextNodes(node) {
                        if (node.type === 'text' && node.data.trim()) {
                            const ref = nodeIdxMap[itemIdx] && nodeIdxMap[itemIdx][textNodeIdx];
                            if (ref) node.data = ref.text;
                            textNodeIdx++;
                        } else if (node.children && node.children.length) {
                            for (let child of node.children) {
                                replaceTextNodes(child);
                            }
                        }
                    }
                    for (let node of $.root().children()) {
                        replaceTextNodes(node);
                    }

                    const formattedStyle = style ? `    <style>\n${style.split('\n').map(line => '        ' + line).join('\n')}\n    </style>\n` : '';
                    const formattedContent = $.root().html()
                        .replace(/<div/g, '<DIV')
                        .replace(/<\/div>/g, '</DIV>')
                        .replace(/<img/g, '<IMG')
                        .replace(/<\/img>/g, '')
                        .replace(/<br\/?>/g, '<BR/>')
                        .replace(/<b>/g, '<B>')
                        .replace(/<\/b>/g, '</B>')
                        .replace(/<table/g, '<TABLE')
                        .replace(/<\/table>/g, '</TABLE>')
                        .replace(/<tbody/g, '<TBODY')
                        .replace(/<\/tbody>/g, '</TBODY>')
                        .replace(/<tr/g, '<TR')
                        .replace(/<\/tr>/g, '</TR>')
                        .replace(/<td/g, '<TD')
                        .replace(/<\/td>/g, '</TD>')
                        .replace(/<span/g, '<SPAN')
                        .replace(/<\/span>/g, '</SPAN>');

                    item.content = formattedStyle + formattedContent;
                }
            });
        }
        const outputFile = generateOutputFileName();
        const outputPath = path.join(backupDir, outputFile);
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
        const latestPath = path.join(backupDir, 'latest_translation.json');
        fs.copyFileSync(outputPath, latestPath);
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

async function fetchApifyDataByUrl(url) {
    try {
        console.log(`Đang lấy dữ liệu từ: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Lỗi HTTP: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu:', error.message);
        throw error;
    }
}

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server listening on port ${PORT} (accessible from all network interfaces)`);
}); 