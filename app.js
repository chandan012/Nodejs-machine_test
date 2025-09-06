const express = require('express');
const ejsLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const initializeDB = require('./database');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(ejsLayouts);
app.set('layout', 'layout');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Initialize database and start server
async function startServer() {
  try {
    const db = await initializeDB();
    
    // Make db available to all routes
    app.locals.db = db;
    
    // Create tables if they don't exist - disable foreign key checks temporarily
    await db.execute('SET FOREIGN_KEY_CHECKS = 0');
    
    await db.execute(`CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      categoryId INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL
    )`);
    
    await db.execute('SET FOREIGN_KEY_CHECKS = 1');

    // Insert sample data if tables are empty
    const [categoryCount] = await db.execute('SELECT COUNT(*) as count FROM categories');
    if (categoryCount[0].count === 0) {
      await db.execute('INSERT INTO categories (name) VALUES (?)', ['Electronics']);
      await db.execute('INSERT INTO categories (name) VALUES (?)', ['Clothing']);
      await db.execute('INSERT INTO categories (name) VALUES (?)', ['Books']);
    }

    const [productCount] = await db.execute('SELECT COUNT(*) as count FROM products');
    if (productCount[0].count === 0) {
      await db.execute('INSERT INTO products (name, categoryId) VALUES (?, ?)', ['Laptop', 1]);
      await db.execute('INSERT INTO products (name, categoryId) VALUES (?, ?)', ['T-Shirt', 2]);
      await db.execute('INSERT INTO products (name, categoryId) VALUES (?, ?)', ['Novel', 3]);
    }

    // Root route - show welcome page
    app.get('/', (req, res) => {
      res.render('home', { title: 'Home' });
    });

    // Category Routes
    app.get('/categories', async (req, res) => {
      try {
        const [categories] = await db.execute('SELECT * FROM categories');
        res.render('categories/index', { categories, title: 'Categories' });
      } catch (error) {
        console.error('Categories Error:', error);
        res.status(500).send('Server Error');
      }
    });

    app.get('/categories/add', (req, res) => {
      res.render('categories/add', { title: 'Add Category' });
    });

    app.post('/categories/add', async (req, res) => {
      try {
        await db.execute('INSERT INTO categories (name) VALUES (?)', [req.body.name]);
        res.redirect('/categories');
      } catch (error) {
        console.error('Add Category Error:', error);
        res.status(500).send('Server Error');
      }
    });

    app.get('/categories/edit/:id', async (req, res) => {
      try {
        const [categories] = await db.execute('SELECT * FROM categories WHERE id = ?', [req.params.id]);
        res.render('categories/edit', { category: categories[0], title: 'Edit Category' });
      } catch (error) {
        console.error('Edit Category Error:', error);
        res.status(500).send('Server Error');
      }
    });

    app.post('/categories/edit/:id', async (req, res) => {
      try {
        await db.execute('UPDATE categories SET name = ? WHERE id = ?', [req.body.name, req.params.id]);
        res.redirect('/categories');
      } catch (error) {
        console.error('Update Category Error:', error);
        res.status(500).send('Server Error');
      }
    });

    app.get('/categories/delete/:id', async (req, res) => {
      try {
        // First check if any products are using this category
        const [products] = await db.execute('SELECT COUNT(*) as count FROM products WHERE categoryId = ?', [req.params.id]);
        
        if (products[0].count > 0) {
          // If products exist, set their categoryId to NULL before deleting the category
          await db.execute('UPDATE products SET categoryId = NULL WHERE categoryId = ?', [req.params.id]);
        }
        
        await db.execute('DELETE FROM categories WHERE id = ?', [req.params.id]);
        res.redirect('/categories');
      } catch (error) {
        console.error('Delete Category Error:', error);
        res.status(500).send('Server Error');
      }
    });

  // Product Routes - Fixed version
app.get('/products', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    // Using template literals for LIMIT and OFFSET to avoid parameter issues
    const [products] = await db.execute(`
      SELECT p.*, c.name as categoryName 
      FROM products p 
      LEFT JOIN categories c ON p.categoryId = c.id 
      ORDER BY p.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const [[{ total }]] = await db.execute('SELECT COUNT(*) as total FROM products');
    const totalPages = Math.ceil(total / limit);

    res.render('products/index', { 
      products, 
      currentPage: page, 
      totalPages,
      title: 'Products'
    });
  } catch (error) {
    console.error('Products Page Error:', error);
    res.status(500).send('Server Error');
  }
});

app.get('/products/add', async (req, res) => {
  try {
    const [categories] = await db.execute('SELECT * FROM categories');
    res.render('products/add', { categories, title: 'Add Product' });
  } catch (error) {
    console.error('Add Product Page Error:', error);
    res.status(500).send('Server Error');
  }
});

app.post('/products/add', async (req, res) => {
  try {
    const { name, categoryId } = req.body;
    
    // Handle case where categoryId might be empty
    const categoryValue = categoryId && categoryId !== '' ? parseInt(categoryId) : null;
    
    await db.execute('INSERT INTO products (name, categoryId) VALUES (?, ?)', 
      [name, categoryValue]);
    res.redirect('/products');
  } catch (error) {
    console.error('Add Product Error:', error);
    res.status(500).send('Server Error');
  }
});

app.get('/products/edit/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const [products] = await db.execute('SELECT * FROM products WHERE id = ?', [productId]);
    
    if (products.length === 0) {
      return res.status(404).send('Product not found');
    }
    
    const [categories] = await db.execute('SELECT * FROM categories');
    res.render('products/edit', { product: products[0], categories, title: 'Edit Product' });
  } catch (error) {
    console.error('Edit Product Page Error:', error);
    res.status(500).send('Server Error');
  }
});

app.post('/products/edit/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { name, categoryId } = req.body;
    
    // Handle case where categoryId might be empty
    const categoryValue = categoryId && categoryId !== '' ? parseInt(categoryId) : null;
    
    await db.execute('UPDATE products SET name = ?, categoryId = ? WHERE id = ?', 
      [name, categoryValue, productId]);
    res.redirect('/products');
  } catch (error) {
    console.error('Update Product Error:', error);
    res.status(500).send('Server Error');
  }
});

app.get('/products/delete/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    await db.execute('DELETE FROM products WHERE id = ?', [productId]);
    res.redirect('/products');
  } catch (error) {
    console.error('Delete Product Error:', error);
    res.status(500).send('Server Error');
  }
});

    // Start the server
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();