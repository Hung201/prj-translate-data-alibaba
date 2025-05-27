import { Page, Product } from '../models/index.js';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

const backupDir = 'backup_translations';
const apiUrl = 'https://api-translate.daisan.vn/translate/batch';
const BATCH_SIZE = 125;
const CONCURRENT_BATCHES = 7;
const limit = pLimit(CONCURRENT_BATCHES);

class TranslateService {

    constructor() {
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
            console.log(`Đã tạo thư mục ${backupDir}`);
        }
    }

    async fetchApifyDataByUrl(url) {
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

    async translateBatch(texts) {
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

    extractTextNodesFromContent(data) {
        let allTextNodes = [];
        let nodeRefs = [];
        let cheerioObjs = [];
        data.forEach((item, itemIdx) => {
            if (item.content) {
                const $ = cheerio.load(item.content, {
                    decodeEntities: false,
                    _useHtmlParser2: true,
                    lowerCaseTags: false,
                    lowerCaseAttributeNames: false,
                    recognizeSelfClosing: true
                });

                let styleContent = '';
                $('style').each(function () {
                    styleContent += $(this).html();
                    $(this).remove();
                });

                $('html').each(function () {
                    $(this).replaceWith($(this).html());
                });
                $('head').each(function () {
                    $(this).replaceWith($(this).html());
                });
                $('body').each(function () {
                    $(this).replaceWith($(this).html());
                });

                cheerioObjs[itemIdx] = {
                    $: $,
                    style: styleContent
                };

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

    generateOutputFileName() {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-');
        return `data_alibaba_translated_${timestamp}.json`;
    }

    async translateAndSaveApifyData(apifyUrl) {
        const data = await this.fetchApifyDataByUrl(apifyUrl);
        const titles = data.map(item => item.title);
        let translatedTitles = await this.translateBatch(titles);

        data.forEach((item, i) => {
            item.title = translatedTitles[i] || item.title;
        });

        const { allTextNodes, nodeRefs, cheerioObjs } = this.extractTextNodesFromContent(data);
        let translatedTextNodes = [];

        if (allTextNodes.length > 0) {
            const batches = [];
            for (let i = 0; i < allTextNodes.length; i += BATCH_SIZE) {
                batches.push(allTextNodes.slice(i, i + BATCH_SIZE));
            }
            const promises = batches.map(batch => limit(() => this.translateBatch(batch)));
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

        const outputFile = this.generateOutputFileName();
        const outputPath = path.join(backupDir, outputFile);
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
        const latestPath = path.join(backupDir, 'latest_translation.json');
        fs.copyFileSync(outputPath, latestPath);

        return data; // Trả về dữ liệu đã dịch để Controller gửi response
    }

    async getAllPages(limit = 20) {
        const pages = await Page.findAll({ limit: limit });
        return pages;
    }

    async getProductsByPageId(pageId) {
        const products = await Product.findAll({
            where: {
                page_id: pageId
            }
        });
        return products;
    }

    async getAllProducts() {
        const products = await Product.findAll({
            attributes: ['id', 'name', 'description', 'page_id'],
        });
        return products;
    }

    async translateProductsAndSave(products) {
        try {
            // Tách name và description thành mảng riêng để dịch
            const names = products.map(p => p.name);
            const descriptions = products.map(p => p.description);

            // Dịch name và description
            const translatedNames = await this.translateBatch(names);
            const translatedDescriptions = await this.translateBatch(descriptions);

            // Cập nhật sản phẩm với bản dịch mới
            const updatePromises = products.map((product, index) => {
                return Product.update(
                    {
                        name: translatedNames[index],
                        description: translatedDescriptions[index]
                    },
                    {
                        where: { id: product.id }
                    }
                );
            });

            await Promise.all(updatePromises);

            // Lấy lại danh sách sản phẩm đã cập nhật
            const updatedProducts = await Product.findAll({
                where: {
                    id: products.map(p => p.id)
                }
            });

            return updatedProducts;
        } catch (error) {
            console.error('Error translating products:', error);
            throw error;
        }
    }

    generateBackupFileName() {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-');
        return `backup_products_${timestamp}.json`;
    }

    async createBackupFile(products, pageId) {
        const backupDir = path.join(process.cwd(), 'backup_data_available');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
        }

        const backupData = {
            page_id: pageId,
            timestamp: new Date().toISOString(),
            products: products.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                page_id: p.page_id
            }))
        };

        const backupFile = this.generateBackupFileName();
        const backupPath = path.join(backupDir, backupFile);
        fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
        return backupPath;
    }

    async translateProductsWithoutSave(products, pageId) {
        try {
            // Create backup of untranslated data
            await this.createBackupFile(products, pageId);

            // Chuyển mỗi sản phẩm thành object {title, content} giống dataset Apify
            const data = products.map(p => ({ title: p.name, content: p.description }));

            // Dịch title
            const titles = data.map(item => item.title);
            let translatedTitles = await this.translateBatch(titles);
            data.forEach((item, i) => {
                item.title = translatedTitles[i] || item.title;
            });

            // Dịch content
            const { allTextNodes, nodeRefs, cheerioObjs } = this.extractTextNodesFromContent(data);
            let translatedTextNodes = [];
            if (allTextNodes.length > 0) {
                const batches = [];
                for (let i = 0; i < allTextNodes.length; i += BATCH_SIZE) {
                    batches.push(allTextNodes.slice(i, i + BATCH_SIZE));
                }
                const promises = batches.map(batch => limit(() => this.translateBatch(batch)));
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
                            .replace(/<\/div>/g, '<\/DIV>')
                            .replace(/<img/g, '<IMG')
                            .replace(/<\/img>/g, '')
                            .replace(/<br\/?/g, '<BR/>')
                            .replace(/<b>/g, '<B>')
                            .replace(/<\/b>/g, '<\/B>')
                            .replace(/<table/g, '<TABLE')
                            .replace(/<\/table>/g, '<\/TABLE>')
                            .replace(/<tbody/g, '<TBODY')
                            .replace(/<\/tbody>/g, '<\/TBODY>')
                            .replace(/<tr/g, '<TR')
                            .replace(/<\/tr>/g, '<\/TR>')
                            .replace(/<td/g, '<TD')
                            .replace(/<\/td>/g, '<\/TD>')
                            .replace(/<span/g, '<SPAN')
                            .replace(/<\/span>/g, '<\/SPAN>');
                        item.content = formattedStyle + formattedContent;
                    }
                });
            }

            // Gán lại vào sản phẩm và cập nhật database
            const updatePromises = products.map((product, index) => {
                return Product.update(
                    {
                        name: data[index].title,
                        description: data[index].content
                    },
                    {
                        where: { id: product.id }
                    }
                );
            });

            await Promise.all(updatePromises);

            // Lấy lại danh sách sản phẩm đã cập nhật
            const updatedProducts = await Product.findAll({
                where: {
                    id: products.map(p => p.id)
                }
            });

            return updatedProducts;
        } catch (error) {
            console.error('Error translating products:', error);
            throw error;
        }
    }

    // TODO: Add method for translateFromFileInput
}

export default new TranslateService(); 