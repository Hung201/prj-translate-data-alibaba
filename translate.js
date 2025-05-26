import express from 'express';
import translateController from './controllers/translateController.js';

const app = express();
app.use(express.json());

// Định nghĩa các routes và trỏ đến controller methods
app.post('/translate', translateController.translateApifyData);

app.get('/test', translateController.testEndpoint);

app.get('/pages', translateController.getAllPages);

app.get('/pages/:pageId/products', translateController.getProductsByPageId);

// Route mới để lấy tất cả products
app.get('/products', translateController.getAllProducts);

// TODO: Add route for translateFromFileInput

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server listening on port ${PORT} (accessible from all network interfaces)`);
}); 