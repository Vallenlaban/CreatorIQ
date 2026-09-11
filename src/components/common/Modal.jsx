import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from 'lucide-react';

export const Modal = ({
  isOpen,
  onClose,
  gallery = [],
  currentIndex = 0,
  onNavigate
}) => {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
  }, [currentIndex, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && gallery.length > 0) {
        onNavigate((currentIndex - 1 + gallery.length) % gallery.length);
      }
      if (e.key === 'ArrowRight' && gallery.length > 0) {
        onNavigate((currentIndex + 1) % gallery.length);
      }
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
    };

    window.addEventListener('keydown', handleKeyDown);
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, currentIndex, gallery.length]);

  if (!isOpen || gallery.length === 0) return null;

  const currentItem = gallery[currentIndex] || gallery[0];

  const handleZoomIn = (e) => {
    if (e) e.stopPropagation();
    setZoom((prev) => Math.min(prev + 0.25, 3.0));
  };

  const handleZoomOut = (e) => {
    if (e) e.stopPropagation();
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleDownload = (e) => {
    if (e) e.stopPropagation();
    const link = document.createElement('a');
    link.href = currentItem.src;
    link.download = currentItem.downloadFilename || `${currentItem.title.replace(/[^a-zA-Z0-9]/g, '_')}_HD.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrev = (e) => {
    if (e) e.stopPropagation();
    onNavigate((currentIndex - 1 + gallery.length) % gallery.length);
  };

  const handleNext = (e) => {
    if (e) e.stopPropagation();
    onNavigate((currentIndex + 1) % gallery.length);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/90 backdrop-blur-md items-center justify-center p-4 sm:p-8 transition-opacity duration-300 ease-out"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl w-full flex flex-col items-center transform transition-all duration-300 ease-out scale-100 opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image View Box */}
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/20 shadow-[0_0_50px_rgba(168,85,247,0.3)] bg-black flex items-center justify-center">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/30 shadow-xl transition-all hover:scale-110 cursor-pointer z-40"
            title="Close Preview"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          {/* Image */}
          <img
            src={currentItem.src}
            alt={currentItem.title}
            onError={(e) => {
              if (currentItem.fallbackSrc) {
                e.currentTarget.src = currentItem.fallbackSrc;
              }
            }}
            style={{ transform: `scale(${zoom})` }}
            className="max-w-full max-h-full object-contain transition-transform duration-200 ease-out select-none"
          />

          {/* Side Nav Buttons */}
          <button
            onClick={handlePrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center border border-white/20 shadow-lg transition-all hover:scale-110 cursor-pointer z-20"
            title="Previous Image"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>

          <button
            onClick={handleNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center border border-white/20 shadow-lg transition-all hover:scale-110 cursor-pointer z-20"
            title="Next Image"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>

          {/* Floating Bottom Toolbar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full bg-black/40 border border-white/20 text-white shadow-2xl z-30">
            <span className="text-white/90 font-mono text-xs font-bold px-1">
              {currentIndex + 1}/{gallery.length}
            </span>

            <span className="w-px h-4 bg-white/20"></span>

            <button
              onClick={handlePrev}
              className="p-1 hover:text-accent-purple text-white/90 transition-colors cursor-pointer"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={handleNext}
              className="p-1 hover:text-accent-purple text-white/90 transition-colors cursor-pointer"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="w-px h-4 bg-white/20"></span>

            <button
              onClick={handleDownload}
              className="p-1 hover:text-accent-purple text-white/90 transition-colors cursor-pointer"
              title="Download HD"
            >
              <Download className="w-4 h-4" />
            </button>

            <span className="w-px h-4 bg-white/20"></span>

            <button
              onClick={handleZoomOut}
              className="p-1 hover:text-accent-purple text-white/90 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <button
              onClick={handleZoomIn}
              className="p-1 hover:text-accent-purple text-white/90 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
