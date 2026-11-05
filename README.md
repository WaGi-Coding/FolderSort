



# 📂 FolderSort
![GitHub release (latest by date)](https://img.shields.io/github/v/release/WaGi-Coding/FolderSort?label=latest%20release&style=for-the-badge)
![GitHub all releases](https://img.shields.io/github/downloads/WaGi-Coding/FolderSort/total?label=Github%20Release%20Downloads&style=for-the-badge)

![GitHub Repo stars](https://img.shields.io/github/stars/WaGi-Coding/FolderSort?style=social)


<p align="center">
  <a href="https://github.com/WaGi-Coding/FolderSort/releases/"><img alt="Download" src="https://i.imgur.com/IMSXFnA.png"/></a>
</p>

---

<p align="center">
  <img src="https://i.imgur.com/YuHi31p.png" width="300">
</p>

<p align="center">
  <img src="https://i.imgur.com/ukDkdWe.gif">
</p>


**FolderSort** is a modern, responsive desktop application built for local batch renaming and sorting of images. It combines the familiar flexibility of the Windows Explorer (such as dynamic zooming and versatile sorting criteria) with a fast, modern user interface.

---

## ✨ Key Features

* **Advanced Sorting (Windows-Style):** Sort images by Name, EXIF Capture Date, Creation Date, Modification Date, File Type, or File Size (ascending & descending).
* **Manual Drag & Drop:** Reorder images freely using intuitive drag-and-drop functionality powered by `@dnd-kit`.
* **Dynamic Grid Zooming:** Smoothly adjust the grid layout (from 2 to 12 columns) using `Ctrl + MouseWheel`.
* **EXIF Metadata Extraction:** Automatically extracts true capture dates from JPEGs and other formats using `exifr`.
* **Intelligent Renaming:** Flexible prefixes, suffixes, and automatic or manual digit padding buffers (e.g., `001`, `0001`).
* **Safe Renaming Process:** A two-step temporary file renaming process prevents file system conflicts.
* **Theme Support:** Seamlessly switch between **Light Mode**, **Dark Mode**, and your **System Preference**.

---

## 🚀 For Users (User Guide)

1. **Open Folder:** Click the **"Open Folder"** button in the top left corner to select the directory containing the images you want to sort.
2. **Sort & Arrange:** 
   * Use the **"Sort by"** dropdown menu to automatically sort images by criteria like Name or EXIF Capture Date.
   * Drag and drop image cards to any custom position (this automatically switches the mode to `CUSTOM`).
3. **Adjust View:** Hold `Ctrl` and scroll with your mouse wheel to make the image cards larger or smaller.
4. **Apply Renaming:** Optionally define a **Prefix** or **Suffix**, then click **"Apply changes to disk"** in the bottom right corner to save changes permanently. Enable **"Keep original name"** to append each file's current name (without its extension) after the number and suffix. For example, `holiday.jpg` becomes `image_01_holiday.jpg`. If the suffix is empty when this option is enabled, `_` is added automatically; disabling the option removes it again if it is the only suffix.
5. **Updates:** Use **"Check for updates"** to check manually, or enable **"Automatic updates"** to check when the app starts. Available updates download and install automatically, then FolderSort restarts.

---

## 💻 For Developers

### Prerequisites
Make sure you have the following installed on your system:
* **Node.js** (LTS version recommended)
* **npm**

### Installation & Local Development

1. Clone the repository or open the project folder in your terminal:
   ```bash
   cd FolderSort
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application in development mode (launches the Vite dev server and Electron concurrently):
   ```bash
   npm run dev
   ```

### Building the Standalone `.exe` (Installer)

To generate a standalone Windows application installer, the project utilizes `electron-builder`.

1. Run the build and pack command in your terminal:
   ```bash
   npm run pack
   ```
2. Once completed successfully, you will find the finished installer executable inside the newly created **`release`** folder.

### Publishing a GitHub Release

Set the package version to match the release tag (for example, `1.0.4`), run `npm run pack`, and create the release manually on GitHub with the same tag. Attach the generated `FolderSort.Setup.<version>.exe` asset. The app checks the public latest release and requires no GitHub token.

---

## 🛠️ Tech Stack

* **Desktop Framework:** [Electron](https://www.electronjs.org/) (CommonJS Backend)
* **Frontend:** [React](https://react.dev/) (with Vite & TypeScript)
* **Styling:** [Tailwind CSS](https://tailwindcss.com/) (v3, with class-based Dark Mode)
* **Drag & Drop:** [@dnd-kit/core](https://dndkit.com/) & [@dnd-kit/sortable](https://github.com/clauderic/dnd-kit)
* **Metadata / EXIF:** [exifr](https://github.com/MikeKovarik/exifr)
* **Icons:** [Lucide React](https://lucide.dev/)
* **Packaging:** [electron-builder](https://www.electron.build/)
