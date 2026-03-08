/**
 * Database Module
 * Uses Supabase if keys are provided, otherwise falls back to LocalStorage
 */

// TODO: To use Supabase, create a project at supabase.com and paste your URL and ANON KEY here:
const SUPABASE_URL = 'https://ickmifzmafbuntqebvhy.supabase.co'; // e.g. 'https://xyzcompany.supabase.co'
const SUPABASE_KEY = 'sb_publishable_RsMUmI33eJENjoZk0uONmQ_hqufVXDA'; // e.g. 'eyJhbGciOiJIUzI...

export let supabaseClient = null;
let useLocalStorage = false;

if (SUPABASE_URL && SUPABASE_KEY && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("Connected to Supabase.");
} else {
    console.warn("Supabase credentials not found. Using LocalStorage fallback.");
    useLocalStorage = true;
    if (!localStorage.getItem('pro_products_db')) {
        // Initialize with some dummy data if empty
        const initialData = [
            { id: '1', name: 'Notebook Pro', cat: 'Eletrônicos', quantity: 15, min_quantity: 5, created_at: new Date().toISOString() },
            { id: '2', name: 'Mouse Sem Fio', cat: 'Eletrônicos', quantity: 3, min_quantity: 10, created_at: new Date().toISOString() },
            { id: '3', name: 'Caderno Universitário', cat: 'Papelaria', quantity: 50, min_quantity: 20, created_at: new Date().toISOString() }
        ];
        localStorage.setItem('pro_products_db', JSON.stringify(initialData));
    }
}

export const db = {
    isSupabase: !useLocalStorage,

    async getProducts() {
        if (useLocalStorage) {
            return JSON.parse(localStorage.getItem('pro_products_db')) || [];
        } else {
            const { data, error } = await supabaseClient.from('products').select('*');
            if (error) throw error;
            return data;
        }
    },
    
    async logActivity(action, details) {
        if (!useLocalStorage && supabaseClient) {
            try {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (user) {
                    await supabaseClient.from('activity_logs').insert([{
                        user_id: user.id,
                        user_email: user.email,
                        action: action,
                        details: details
                    }]);
                }
            } catch (err) {
                console.error("Failed to log activity:", err);
            }
        }
    },

    async addProduct(product) {
        if (useLocalStorage) {
            const products = await this.getProducts();
            const newProduct = { 
                ...product, 
                id: Date.now().toString(), 
                ifood_status: true,
                created_at: new Date().toISOString() 
            };
            products.push(newProduct);
            localStorage.setItem('pro_products_db', JSON.stringify(products));
            return newProduct;
        } else {
            const { data, error } = await supabaseClient.from('products').insert([product]).select();
            if (error) throw error;
            await this.logActivity('ADDED_PRODUCT', { name: product.name, cat: product.cat });
            return data[0];
        }
    },

    async updateProduct(id, updates) {
        if (useLocalStorage) {
            const products = await this.getProducts();
            const index = products.findIndex(p => p.id === id);
            if (index !== -1) {
                products[index] = { ...products[index], ...updates };
                localStorage.setItem('pro_products_db', JSON.stringify(products));
            }
        } else {
            const { error } = await supabaseClient.from('products').update(updates).eq('id', id);
            if (error) throw error;
            await this.logActivity('EDITED_PRODUCT', { id, updates });
        }
    },

    async deleteProduct(id) {
        if (useLocalStorage) {
            let products = await this.getProducts();
            products = products.filter(p => String(p.id) !== String(id));
            localStorage.setItem('pro_products_db', JSON.stringify(products));
        } else {
            const { error } = await supabaseClient.from('products').delete().eq('id', id);
            if (error) throw error;
            await this.logActivity('DELETED_PRODUCT', { id });
        }
    }
};
