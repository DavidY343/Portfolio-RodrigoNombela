# Portfolio - Rodrigo Nombela

Este es el portfolio personal de **Rodrigo Nombela**, Realizador Audiovisual y Narrador Visual. El sitio web muestra sus proyectos más recientes extraídos automáticamente de Behance, presentados con una estética premium, minimalista y cinematográfica.

## 🚀 Características

- **Sincronización con Behance**: Los proyectos se obtienen automáticamente mediante la integración de Behance (RSS + Scraping).
- **Galería Dinámica**: Cada proyecto incluye un carrusel de imágenes de alta resolución.
- **Diseño Premium**: Interfaz moderna con efectos de glassmorphism, gradientes suaves y animaciones sutiles.
- **Despliegue Automático**: Configurado con GitHub Actions para reconstruirse diariamente y mantener los proyectos actualizados.

## 🛠️ Tecnologías

- [Astro](https://astro.build/) - Framework web para una carga ultra rápida.
- [Tailwind CSS](https://tailwindcss.com/) - Estilización moderna y responsive.
- [TypeScript](https://www.typescriptlang.org/) - Código seguro y mantenible.

## 💻 Desarrollo Local

Para ejecutar este proyecto en tu propia máquina:

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/DavidY343/Portfolio-RodrigoNombela.git
   cd Portfolio-RodrigoNombela
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Ejecutar en modo desarrollo**:
   ```bash
   npm run dev
   ```
   Abre [http://localhost:4321](http://localhost:4321) en tu navegador.

## 📦 Estructura del Proyecto

- `src/services/behance.ts`: Lógica de extracción y deduplicación de imágenes.
- `src/components/`: Componentes reutilizables (Módales, Galería, Cards).
- `src/pages/api/`: Proxy para evitar problemas de CORS al cargar imágenes dinámicamente.
- `.github/workflows/`: Automatización del despliegue y actualización diaria.

---
Creado por **David Yáñez** | 13/03/2025
