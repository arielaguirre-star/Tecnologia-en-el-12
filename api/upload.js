import axios from 'axios';
import FormData from 'form-data';
import multer from 'multer';

// Configuración de Multer en memoria con límite estricto de 4.4 MB para evitar exceder el payload de Vercel
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 4.4 * 1024 * 1024 // 4.4 MB máximo
    }
});

// Helper para procesar el middleware de Multer en una Vercel Serverless Function
function runMiddleware(req, res, fn) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) {
                return reject(result);
            }
            return resolve(result);
        });
    });
}

// Deshabilitar el bodyParser nativo de Vercel para permitir multipart/form-data
export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    // Configurar cabeceras CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
    }

    try {
        // Ejecutar procesamiento de la imagen mediante multer
        await runMiddleware(req, res, upload.single('image'));

        if (!req.file) {
            return res.status(400).json({ error: 'No se ha adjuntado ningún archivo de imagen.' });
        }

        const apiKey = process.env.IMGBB_API_KEY;
        if (!apiKey) {
            console.error('ERROR: IMGBB_API_KEY no está definida en las Environment Variables.');
            return res.status(500).json({ error: 'Error de configuración en el servidor.' });
        }

        // Construir la petición multipart para ImgBB
        const formData = new FormData();
        formData.append('image', req.file.buffer.toString('base64'));

        const imgbbResponse = await axios.post(
            `https://api.imgbb.com/1/upload?key=${apiKey}`,
            formData,
            { headers: formData.getHeaders() }
        );

        if (imgbbResponse.data && imgbbResponse.data.success) {
            return res.status(200).json({
                success: true,
                url: imgbbResponse.data.data.url,
                display_url: imgbbResponse.data.data.display_url,
                delete_url: imgbbResponse.data.data.delete_url
            });
        } else {
            return res.status(500).json({ error: 'Respuesta no válida de ImgBB.' });
        }

    } catch (error) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                error: 'El archivo excede el límite máximo permitido por Vercel (4.5 MB).'
            });
        }
        
        console.error('Error al subir a ImgBB:', error.response?.data || error.message);
        return res.status(500).json({ 
            error: 'Error interno procesando la carga de la imagen.',
            details: error.response?.data?.error?.message || error.message 
        });
    }
}
