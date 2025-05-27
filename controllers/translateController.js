import translateService from '../services/translateService.js';

class TranslateController {

    async translateApifyData(req, res) {
        const apifyUrl = req.body.url || req.query.url;
        if (!apifyUrl) {
            return res.status(400).json({ error: 'Thiếu url Apify' });
        }
        try {
            const data = await translateService.translateAndSaveApifyData(apifyUrl);
            return res.json(data);
        } catch (err) {
            console.error('Error in translateApifyData controller:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    testEndpoint(req, res) {
        console.log('Received GET request to /test');
        res.send('Test endpoint is working!');
    }

    async getAllPages(req, res) {
        console.log('Received GET request to /pages');
        try {
            const pages = await translateService.getAllPages(req.query.limit); // Có thể truyền limit từ query param nếu cần
            res.json(pages);
        } catch (err) {
            console.error('Error in getAllPages controller:', err);
            res.status(500).json({ error: err.message });
        }
    }

    async getProductsByPageId(req, res) {
        const pageId = req.params.pageId;
        const shouldTranslate = req.query.translate === 'true';
        console.log(`Received GET request for products of page_id: ${pageId}, translate: ${shouldTranslate}`);

        try {
            const products = await translateService.getProductsByPageId(pageId);
            if (products.length === 0) {
                return res.status(404).json({ message: 'Không tìm thấy sản phẩm nào cho page_id này' });
            }

            if (shouldTranslate) {
                const translatedProducts = await translateService.translateProductsWithoutSave(products, pageId);
                return res.json({
                    message: 'Đã dịch sản phẩm thành công',
                    total_translated: translatedProducts.length,
                    products: translatedProducts
                });
            }

            res.json(products);
        } catch (err) {
            console.error('Error in getProductsByPageId controller:', err);
            res.status(500).json({ error: err.message });
        }
    }

    async getAllProducts(req, res) {
        console.log('Received GET request to /products');
        try {
            const products = await translateService.getAllProducts();
            res.json(products);
        } catch (err) {
            console.error('Error in getAllProducts controller:', err);
            res.status(500).json({ error: err.message });
        }
    }

    // TODO: Add controller method for translateFromFileInput
}

export default new TranslateController(); 