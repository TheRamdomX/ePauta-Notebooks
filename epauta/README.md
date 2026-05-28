# ePAUTA

> Plataforma educativa open source para compartir y visualizar recursos académicos universitarios

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Astro](https://astro.badg.es/v2/built-with-astro/tiny.svg)](https://astro.build)

## 📖 Descripción

ePAUTA es una plataforma web diseñada para facilitar el acceso a recursos académicos de cursos universitarios. Permite a estudiantes visualizar y descargar material educativo organizado por programas académicos y asignaturas.

### Características principales

- 📚 Visualización de PDFs y documentos directamente en el navegador
- 🔍 Organización por programas académicos (EIT, EOC, EII, Plan Común)
- 📱 Diseño responsive y moderno
- ⚡ Carga rápida con Astro y SSR
- 🎨 Interfaz limpia construida con Tailwind CSS y shadcn/ui
- ☁️ Almacenamiento en la nube con Cloudflare R2

## 🚀 Tech Stack

- **Framework:** [Astro](https://astro.build) v4.3.5
- **UI Library:** [React](https://react.dev) v18.2.0
- **Styling:** [Tailwind CSS](https://tailwindcss.com) v3.4.1
- **Components:** [shadcn/ui](https://ui.shadcn.com) + [Radix UI](https://www.radix-ui.com)
- **PDF Viewer:** [react-pdf-viewer](https://react-pdf-viewer.dev) v3.12.0
- **Storage:** [Cloudflare R2](https://www.cloudflare.com/products/r2/) (AWS S3 compatible)
- **Deployment:** [Vercel](https://vercel.com)
- **Language:** [TypeScript](https://www.typescriptlang.org) v5.3.3

## 📋 Requisitos previos

- Node.js 18.0 o superior
- npm o pnpm
- Cuenta de Cloudflare con R2 habilitado (para almacenamiento de archivos)

## 🛠️ Instalación

1. Clona el repositorio:

```bash
git clone https://github.com/open-source-udp/epauta.git
cd epauta
```

2. Instala las dependencias:

```bash
npm install
```

3. Configura las variables de entorno:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus credenciales de Cloudflare R2:

```env
# Cloudflare R2 Configuration
CLOUFLARE_TOKEN_VALUE=your_cloudflare_token_here
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_BUCKET_NAME=epauta
R2_PUBLIC_DOMAIN=https://yourdomain.com
```

Para obtener las credenciales de R2, consulta la [Guía de configuración de R2](./docs/GUIA_RAPIDA_R2.md).

4. Inicia el servidor de desarrollo:

```bash
npm run dev
```

Abre [http://localhost:4321](http://localhost:4321) en tu navegador.

## 📦 Scripts disponibles

| Comando             | Acción                                               |
| ------------------- | ---------------------------------------------------- |
| `npm install`       | Instala las dependencias                             |
| `npm run dev`       | Inicia el servidor de desarrollo en `localhost:4321` |
| `npm run build`     | Construye el sitio para producción en `./dist/`      |
| `npm run preview`   | Previsualiza la build de producción localmente       |
| `npm run astro`     | Ejecuta comandos de Astro CLI                        |
| `npm run test:r2`   | Prueba la conexión con Cloudflare R2                 |
| `npm run upload:r2` | Sube archivos a Cloudflare R2                        |

## 📁 Estructura del proyecto

```
/
├── public/              # Archivos estáticos
├── src/
│   ├── components/      # Componentes React y Astro
│   │   ├── ui/         # Componentes de shadcn/ui
│   │   ├── FileViewer.jsx
│   │   ├── PDFViewer.jsx
│   │   └── ...
│   ├── data/           # Datos de cursos y recursos
│   │   ├── plan-comun/
│   │   ├── eit/
│   │   ├── eoc/
│   │   └── eii/
│   ├── layouts/        # Layouts de página
│   ├── lib/            # Utilidades y helpers
│   │   ├── storage.ts  # Cliente de Cloudflare R2
│   │   └── utils.ts
│   ├── pages/          # Rutas de la aplicación
│   └── styles/         # Estilos globales
├── scripts/            # Scripts de utilidad
├── docs/               # Documentación adicional
└── package.json
```

## 🔧 Configuración de Cloudflare R2

Este proyecto utiliza Cloudflare R2 para el almacenamiento de archivos. Para configurar R2 consulta la [Guía rápida de R2](./docs/GUIA_RAPIDA_R2.md)

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor, lee nuestra [Guía de contribución](./CONTRIBUTING.md) antes de enviar un Pull Request.

### Proceso rápido:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add: nueva característica'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo [LICENSE](./LICENSE) para más detalles.

## 👥 Autor

**Samuel Angulo**

- GitHub: [@polaarts](https://github.com/polaarts)

## 📞 Soporte

Si encuentras un bug o tienes una sugerencia:

- Abre un [Issue](https://github.com/open-source-udp/epauta/issues)
- Consulta nuestra [Política de seguridad](./SECURITY.md) para reportar vulnerabilidades

---

Hecho con ❤️ para la comunidad universitaria.
