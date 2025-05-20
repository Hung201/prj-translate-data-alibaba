import fs from 'fs';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const inputFile = 'data_alibaba.json';
const outputFile = 'data_alibaba_translated.json'; // Tên file đầu ra mặc định
const apiUrl = 'https://api-translate.daisan.vn/translate/batch';
const BATCH_SIZE = 125; // Số lượng text node tối đa mỗi batch

let countApiCall = 0;

async function translateText(text) {
    countApiCall++;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text,
            target_lang: 'vi',
            source_lang: 'auto'
        })
    });
    if (!response.ok) {
        throw new Error(`API error: ${response.status} - ${await response.text()}`);
    }
    const data = await response.json();
    return data.translated_text;
}

// Dịch tất cả text node trong HTML, giữ nguyên tag và thuộc tính
async function translateHtmlContent(html) {
    const $ = cheerio.load(html, { decodeEntities: false });

    async function translateNode(node) {
        if (node.type === 'text' && node.data.trim()) {
            try {
                node.data = await translateText(node.data);
            } catch (err) {
                console.error('Lỗi dịch text:', node.data, err.message);
            }
        } else if (node.children && node.children.length) {
            for (let child of node.children) {
                await translateNode(child);
            }
        }
    }

    for (let node of $.root().children()) {
        await translateNode(node);
    }

    return $.html();
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
    // Trả về: { allTextNodes: [text1, text2, ...], nodeRefs: [{itemIdx, nodeIdx}], cheerioObjs: [cheerioObj1, ...] }
    let allTextNodes = [];
    let nodeRefs = [];
    let cheerioObjs = [];
    data.forEach((item, itemIdx) => {
        if (item.content) {
            const $ = cheerio.load(item.content, { decodeEntities: false });
            cheerioObjs[itemIdx] = $;
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

async function translateAll() {
    const startTime = Date.now();
    const rawData = fs.readFileSync(inputFile, 'utf8');
    const data = JSON.parse(rawData);
    // 1. Dịch batch title
    const titles = data.map(item => item.title);
    let translatedTitles = [];
    try {
        console.log(`Gửi batch dịch ${titles.length} title...`);
        translatedTitles = await translateBatch(titles);
        console.log('Đã nhận kết quả dịch batch title.');
    } catch (err) {
        console.error('Lỗi dịch batch title:', err.message);
        return;
    }
    data.forEach((item, i) => {
        item.title = translatedTitles[i] || item.title;
    });
    // 2. Dịch batch content (chỉ text node)
    const { allTextNodes, nodeRefs, cheerioObjs } = extractTextNodesFromContent(data);
    let translatedTextNodes = [];
    if (allTextNodes.length > 0) {
        try {
            console.log(`Gửi batch dịch ${allTextNodes.length} text node trong content (chia nhỏ mỗi batch ${BATCH_SIZE})...`);
            for (let i = 0; i < allTextNodes.length; i += BATCH_SIZE) {
                const batch = allTextNodes.slice(i, i + BATCH_SIZE);
                const translatedBatch = await translateBatch(batch);
                translatedTextNodes.push(...translatedBatch);
                console.log(`  Đã dịch batch ${i / BATCH_SIZE + 1}: ${batch.length} text node.`);
            }
            console.log('Đã nhận kết quả dịch batch content.');
        } catch (err) {
            console.error('Lỗi dịch batch content:', err.message);
            return;
        }
        // Gán lại text node đã dịch vào đúng vị trí
        let nodeIdxMap = {}; // {itemIdx: [translatedText1, ...]}
        nodeRefs.forEach((ref, idx) => {
            if (!nodeIdxMap[ref.itemIdx]) nodeIdxMap[ref.itemIdx] = [];
            nodeIdxMap[ref.itemIdx].push({ idx, text: translatedTextNodes[idx] });
        });
        data.forEach((item, itemIdx) => {
            if (item.content && cheerioObjs[itemIdx]) {
                let $ = cheerioObjs[itemIdx];
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
                item.content = $.html();
            }
        });
    }
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf8');
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`Đã dịch xong ${titles.length} title và ${allTextNodes.length} text node content bằng batch, lưu vào ${outputFile}`);
    console.log(`Tổng thời gian dịch: ${duration} giây.`);
}

translateAll(); 