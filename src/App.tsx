import { useState, useMemo, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FolderOpen, ArrowUpDown, Check, Settings2, ArrowUp, ArrowDown, ChevronDown, Sun, Moon, RotateCcw, RefreshCw } from 'lucide-react';

declare global {
  interface Window {
    electronAPI: {
      openDirectory: () => Promise<string | null>;
      readImages: (folderPath: string) => Promise<{ success: boolean; images: any[]; error?: string }>;
      renameFiles: (data: { folderPath: string; items: any[]; prefix: string; postfix: string; padding: number; keepOriginalName: boolean }) => Promise<{ success: boolean; error?: string }>;
      checkForUpdates: () => Promise<{ success: boolean; error?: string }>;
      onUpdateStatus: (callback: (status: { status: string; message: string; progress?: number }) => void) => () => void;
    };
  }
}

interface ImageItem {
  id: string;
  originalName: string;
  extension: string;
  path: string;
  size: number;
  birthtime: number;
  mtime: number;
  exifDate: number;
}

type SortCriterion = 'name' | 'exifDate' | 'type' | 'size' | 'birthtime' | 'mtime';
type SortOrder = 'asc' | 'desc';
type ThemeMode = 'light' | 'dark';
interface AppPreferences {
  folderPath: string;
  prefix: string;
  postfix: string;
  keepOriginalName: boolean;
  manualPaddingOffset: number;
  theme: ThemeMode;
  gridCols: number;
  sortCriterion: SortCriterion;
  sortOrder: SortOrder;
  automaticUpdates: boolean;
}

const preferencesKey = 'foldersort.preferences';

function defaultPreferences(): AppPreferences {
  return {
    folderPath: '',
    prefix: 'image_',
    postfix: '',
    keepOriginalName: false,
    manualPaddingOffset: 0,
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    gridCols: 6,
    sortCriterion: 'name',
    sortOrder: 'asc',
    automaticUpdates: false,
  };
}

function loadPreferences(): AppPreferences {
  const defaults = defaultPreferences();
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey) || '{}');
    return {
      ...defaults,
      ...saved,
      folderPath: typeof saved.folderPath === 'string' ? saved.folderPath : defaults.folderPath,
      prefix: typeof saved.prefix === 'string' ? saved.prefix : defaults.prefix,
      postfix: typeof saved.postfix === 'string' ? saved.postfix : defaults.postfix,
      keepOriginalName: typeof saved.keepOriginalName === 'boolean' ? saved.keepOriginalName : defaults.keepOriginalName,
      manualPaddingOffset: Number.isFinite(saved.manualPaddingOffset) ? Math.max(0, Math.min(5, saved.manualPaddingOffset)) : defaults.manualPaddingOffset,
      theme: saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : defaults.theme,
      gridCols: Number.isFinite(saved.gridCols) ? Math.max(2, Math.min(12, saved.gridCols)) : defaults.gridCols,
      sortCriterion: ['name', 'exifDate', 'type', 'size', 'birthtime', 'mtime'].includes(saved.sortCriterion) ? saved.sortCriterion : defaults.sortCriterion,
      sortOrder: saved.sortOrder === 'desc' ? 'desc' : defaults.sortOrder,
      automaticUpdates: typeof saved.automaticUpdates === 'boolean' ? saved.automaticUpdates : defaults.automaticUpdates,
    };
  } catch {
    return defaults;
  }
}

function getRetainedBaseName(originalName: string, extension: string, prefix: string, postfix: string) {
  const baseName = originalName.slice(0, -extension.length);
  if (!prefix || !baseName.startsWith(prefix)) return baseName;

  const number = baseName.slice(prefix.length).match(/^\d+/)?.[0];
  if (!number) return baseName;

  const remainder = baseName.slice(prefix.length + number.length);
  if (postfix && remainder.length > 0 && !remainder.startsWith(postfix)) return baseName;
  return postfix && remainder.startsWith(postfix) ? remainder.slice(postfix.length) : remainder;
}

function applySorting(items: ImageItem[], criterion: SortCriterion, order: SortOrder) {
  return [...items].sort((a, b) => {
    let comparison = 0;
    switch (criterion) {
      case 'name':
        comparison = a.originalName.localeCompare(b.originalName, undefined, { numeric: true });
        break;
      case 'type':
        comparison = a.extension.localeCompare(b.extension);
        if (comparison === 0) comparison = a.originalName.localeCompare(b.originalName, undefined, { numeric: true });
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'exifDate':
        comparison = a.exifDate - b.exifDate;
        break;
      case 'birthtime':
        comparison = a.birthtime - b.birthtime;
        break;
      case 'mtime':
        comparison = a.mtime - b.mtime;
        break;
      default:
        comparison = a.originalName.localeCompare(b.originalName, undefined, { numeric: true });
        break;
    }
    return order === 'asc' ? comparison : -comparison;
  });
}

function SortableImageCard({ item, previewName, index, version }: { item: ImageItem; previewName: string; index: number; version: number }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-2 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing flex flex-col justify-between">
      <div className="relative aspect-square bg-slate-100 dark:bg-gray-900 rounded overflow-hidden mb-2 flex items-center justify-center">
        <span className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono z-10">#{index + 1}</span>
        <img src={`file://${item.path}?v=${version}`} alt={item.originalName} className="object-contain w-full h-full pointer-events-none" />
      </div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={item.originalName}>Orig: {item.originalName}</p>
        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 truncate" title={previewName}>New: {previewName}</p>
      </div>
    </div>
  );
}

export default function App() {
  const [preferences, setPreferences] = useState<AppPreferences>(loadPreferences);
  const { folderPath, prefix, postfix, keepOriginalName, manualPaddingOffset, theme, gridCols, sortCriterion, sortOrder, automaticUpdates } = preferences;
  const updatePreference = <K extends keyof AppPreferences,>(key: K, value: AppPreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };
  const [images, setImages] = useState<ImageItem[]>([]);
  const [sortMode, setSortMode] = useState<'sorted' | 'custom'>('sorted');

  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<string>('');
  // Chromium cached file:// images by path; renamed files would show stale content
  const [imageVersion, setImageVersion] = useState<number>(0);

  useEffect(() => {
    localStorage.setItem(preferencesKey, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => window.electronAPI.onUpdateStatus((status) => setUpdateStatus(status.message)), []);

  useEffect(() => {
    if (automaticUpdates) void window.electronAPI.checkForUpdates();
  }, [automaticUpdates]);

  // Theme-Logik
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setPreferences((current) => ({
          ...current,
          gridCols: e.deltaY < 0 ? Math.max(2, current.gridCols - 1) : Math.min(12, current.gridCols + 1),
        }));
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!folderPath) return;
    let active = true;
    window.electronAPI.readImages(folderPath).then((res) => {
      if (active && res.success) {
        setImages(applySorting(res.images, sortCriterion, sortOrder));
        setSortMode('sorted');
      }
    });
    return () => { active = false; };
  }, [folderPath, sortCriterion, sortOrder]);

  const handleOpenFolder = async () => {
    const path = await window.electronAPI.openDirectory();
    if (path) {
      updatePreference('folderPath', path);
      if (path === folderPath) {
        const res = await window.electronAPI.readImages(path);
        if (res.success) {
          setImages(applySorting(res.images, sortCriterion, sortOrder));
          setSortMode('sorted');
        }
      }
    }
  };

  const handleSortChange = (criterion: SortCriterion) => {
    let newOrder = sortOrder;
    if (sortCriterion === criterion) {
      newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      updatePreference('sortOrder', newOrder);
    } else {
      updatePreference('sortCriterion', criterion);
      newOrder = 'asc';
      updatePreference('sortOrder', 'asc');
    }

    const sorted = applySorting(images, criterion, newOrder);
    setImages(sorted);
    setSortMode('sorted');
    setIsMenuOpen(false);
  };

  const toggleOrder = () => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    updatePreference('sortOrder', newOrder);
    const sorted = applySorting(images, sortCriterion, newOrder);
    setImages(sorted);
    setSortMode('sorted');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setImages((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setSortMode('custom');
    }
  };

  const effectivePadding = useMemo(() => {
    const autoLength = String(images.length).length;
    return Math.max(autoLength, autoLength + manualPaddingOffset);
  }, [images.length, manualPaddingOffset]);

  const previewNames = useMemo(() => {
    const map = new Map<string, string>();
    images.forEach((item, index) => {
      const paddedNum = String(index + 1).padStart(effectivePadding, '0');
      const originalBaseName = getRetainedBaseName(item.originalName, item.extension, prefix, postfix);
      map.set(item.id, `${prefix}${paddedNum}${postfix}${keepOriginalName ? originalBaseName : ''}${item.extension}`);
    });
    return map;
  }, [images, prefix, postfix, keepOriginalName, effectivePadding]);

  const handleApplyRename = async () => {
    if (!folderPath || images.length === 0) return;
    const confirm = window.confirm(`Really rename ${images.length} files in the folder?`);
    if (!confirm) return;

    const res = await window.electronAPI.renameFiles({
      folderPath,
      items: images,
      prefix,
      postfix,
      padding: effectivePadding,
      keepOriginalName,
    });

    if (res.success) {
      alert('Successfully renamed!');
      const freshRes = await window.electronAPI.readImages(folderPath);
      if (freshRes.success) {
        setImageVersion((v) => v + 1);
        setImages(applySorting(freshRes.images, sortCriterion, sortOrder));
        setSortMode('sorted');
      }
    } else {
      alert(`Error while renaming: ${res.error}`);
    }
  };

  const handleReset = () => {
    setPreferences(defaultPreferences());
    setImages([]);
    setSortMode('sorted');
    setUpdateStatus('');
  };

  const handleCheckForUpdates = async () => {
    setUpdateStatus('Checking for updates...');
    const result = await window.electronAPI.checkForUpdates();
    if (!result.success && result.error) setUpdateStatus(result.error);
  };

  const gridClassStyle = {
    gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
  };

  const getCriterionLabel = (c: SortCriterion) => {
    switch (c) {
      case 'name': return 'Name';
      case 'type': return 'Type';
      case 'size': return 'Size';
      case 'exifDate': return 'Capture Date (EXIF)';
      case 'birthtime': return 'Creation Date';
      case 'mtime': return 'Modification Date';
      default: return 'Name';
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 select-none">
      <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm relative">
        <div className="flex items-center gap-3">
          <button onClick={handleOpenFolder} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition cursor-pointer">
            <FolderOpen size={18} /> Open Folder
          </button>
          <button onClick={handleReset} className="p-2 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" title="Reset all settings and selected folder" aria-label="Reset all settings and selected folder">
            <RotateCcw size={16} />
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-xs" title={folderPath}>
            {folderPath || 'No folder selected'}
          </span>
        </div>

        <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Prefix:</span>
            <input type="text" value={prefix} onChange={(e) => updatePreference('prefix', e.target.value)} className="w-20 px-2 py-1 text-sm bg-white dark:bg-gray-800 border dark:border-gray-600 rounded" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Suffix:</span>
            <input type="text" value={postfix} onChange={(e) => updatePreference('postfix', e.target.value)} className="w-16 px-2 py-1 text-sm bg-white dark:bg-gray-800 border dark:border-gray-600 rounded" />
            <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap" title="Append each file's current name before its extension">
              <input type="checkbox" checked={keepOriginalName} onChange={(e) => {
                const enabled = e.target.checked;
                if (enabled && !postfix) updatePreference('postfix', '_');
                if (!enabled && postfix === '_') updatePreference('postfix', '');
                updatePreference('keepOriginalName', enabled);
              }} />
              Keep original name
            </label>
          </div>
          <div className="flex items-center gap-1" title="Additional padding buffer digits">
            <Settings2 size={14} className="text-gray-500 dark:text-gray-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Buffer (+):</span>
            <input type="number" min="0" max="5" value={manualPaddingOffset} onChange={(e) => updatePreference('manualPaddingOffset', Number(e.target.value))} className="w-12 px-1 py-1 text-sm bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-center" />
          </div>
          <span className="text-xs font-mono bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-1 rounded border border-blue-200 dark:border-blue-800">
            Padding: {effectivePadding} digits
          </span>
          <span className="text-xs font-mono bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-2 py-1 rounded border dark:border-gray-500">
            Zoom: {gridCols} cols (Ctrl+Wheel)
          </span>
        </div>

        <div className="flex items-center gap-3 relative">
          {/* Theme Switcher Dropdown (Nur Light & Dark) */}
          <div className="relative">
            <button
              onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
              className="flex items-center gap-2 px-3 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm cursor-pointer bg-white dark:bg-gray-800"
              title="Change Theme"
            >
              {theme === 'light' ? <Sun size={16} className="text-amber-500" /> : <Moon size={16} className="text-blue-400" />}
              <ChevronDown size={14} />
            </button>

            {isThemeMenuOpen && (
              <div className="absolute left-0 mt-2 w-36 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-xl z-50 py-1 text-sm">
                <button onClick={() => { updatePreference('theme', 'light'); setIsThemeMenuOpen(false); }} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${theme === 'light' ? 'font-bold text-blue-600 dark:text-blue-400' : ''}`}>
                  <Sun size={14} className="text-amber-500" /> Light
                </button>
                <button onClick={() => { updatePreference('theme', 'dark'); setIsThemeMenuOpen(false); }} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${theme === 'dark' ? 'font-bold text-blue-600 dark:text-blue-400' : ''}`}>
                  <Moon size={14} className="text-blue-400" /> Dark
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Mode:</span>
            <span className={`text-xs font-bold px-2 py-1 rounded ${sortMode === 'custom' ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300' : 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300'}`}>
              {sortMode === 'custom' ? 'CUSTOM (Drag)' : `SORTED (${getCriterionLabel(sortCriterion).toUpperCase()})`}
            </span>
          </div>

          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              disabled={!images.length}
              className="flex items-center gap-2 px-3 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm disabled:opacity-50 cursor-pointer bg-white dark:bg-gray-800"
            >
              <ArrowUpDown size={16} /> Sort by <ChevronDown size={14} />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-xl z-50 py-1 text-sm">
                <button onClick={() => handleSortChange('name')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center ${sortCriterion === 'name' ? 'font-bold text-blue-600 dark:text-blue-400' : ''}`}>
                  <span>Name</span> {sortCriterion === 'name' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                </button>
                <button onClick={() => handleSortChange('exifDate')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center ${sortCriterion === 'exifDate' ? 'font-bold text-blue-600 dark:text-blue-400' : ''}`}>
                  <span>Capture Date (EXIF)</span> {sortCriterion === 'exifDate' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                </button>
                <button onClick={() => handleSortChange('birthtime')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center ${sortCriterion === 'birthtime' ? 'font-bold text-blue-600 dark:text-blue-400' : ''}`}>
                  <span>Creation Date (File)</span> {sortCriterion === 'birthtime' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                </button>
                <button onClick={() => handleSortChange('mtime')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center ${sortCriterion === 'mtime' ? 'font-bold text-blue-600 dark:text-blue-400' : ''}`}>
                  <span>Modification Date</span> {sortCriterion === 'mtime' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                </button>
                <button onClick={() => handleSortChange('type')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center ${sortCriterion === 'type' ? 'font-bold text-blue-600 dark:text-blue-400' : ''}`}>
                  <span>Type (Extension)</span> {sortCriterion === 'type' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                </button>
                <button onClick={() => handleSortChange('size')} className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center ${sortCriterion === 'size' ? 'font-bold text-blue-600 dark:text-blue-400' : ''}`}>
                  <span>Size</span> {sortCriterion === 'size' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                </button>

                <div className="border-t dark:border-gray-700 my-1"></div>

                <button onClick={toggleOrder} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  {sortOrder === 'asc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                  <span>Switch to {sortOrder === 'asc' ? 'Descending' : 'Ascending'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">
        {images.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <ArrowUpDown size={48} className="mb-2 opacity-40" />
            <p>Select a folder to start sorting images.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} autoScroll={{ threshold: { x: 0, y: 0.2 } }}>
            <SortableContext items={images.map(i => i.id)} strategy={rectSortingStrategy}>
              <div className="grid gap-4" style={gridClassStyle}>
                {images.map((item, index) => (
                  <SortableImageCard key={item.id} item={item} previewName={previewNames.get(item.id) || ''} index={index} version={imageVersion} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </main>

      <footer className="bg-white dark:bg-gray-800 border-t dark:border-gray-700 px-6 py-4 flex flex-wrap justify-between items-center gap-3 shadow-inner">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">Total: <b>{images.length}</b> images in folder</span>
          <button onClick={handleCheckForUpdates} className="flex items-center gap-1.5 px-2 py-1.5 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-xs cursor-pointer" title="Check GitHub for a new version">
            <RefreshCw size={14} /> Check for updates
          </button>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap" title="Check, download, and install updates automatically when FolderSort starts">
            <input type="checkbox" checked={automaticUpdates} onChange={(e) => updatePreference('automaticUpdates', e.target.checked)} />
            Automatic updates
          </label>
          {updateStatus && <span className="text-xs text-gray-500 dark:text-gray-400" role="status">{updateStatus}</span>}
        </div>
        <button onClick={handleApplyRename} disabled={images.length === 0} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium shadow transition cursor-pointer">
          <Check size={18} /> Apply changes to disk
        </button>
      </footer>
    </div>
  );
}