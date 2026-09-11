import React, { useState } from 'react';
import StudioTopbar from '../components/studio/StudioTopbar';
import StudioSidebar from '../components/studio/StudioSidebar';
import Modal from '../components/common/Modal';
import { studioVersionsData } from '../data/thumbnailsData';

export const StudioLayout = ({ activeTab, onSelectTab, children }) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const galleryList = Object.values(studioVersionsData).map((v) => ({
    id: v.key,
    title: v.title,
    src: v.img,
    fallbackSrc: v.fallbackSrc,
    downloadFilename: `${v.title.replace(/[^a-zA-Z0-9]/g, '_')}.png`
  }));

  const handleOpenPreview = (imgUrl) => {
    const idx = galleryList.findIndex((g) => g.src === imgUrl);
    setPreviewIndex(idx !== -1 ? idx : 0);
    setIsPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
  };

  const childrenWithProps = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, {
        onOpenPreview: handleOpenPreview,
        onSelectTab,
        activeTab
      });
    }
    return child;
  });

  return (
    <div className="min-h-screen bg-bg-deep text-white flex flex-col font-sans selection:bg-accent-purple selection:text-white">
      {/* Top Navigation */}
      <StudioTopbar showBackButton={true} />

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
        {/* Sidebar */}
        <StudioSidebar activeTab={activeTab} onSelectTab={onSelectTab} />

        {/* Content View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto z-10 relative order-1 md:order-2 pb-24 md:pb-8">
          <div className="max-w-6xl mx-auto">{childrenWithProps}</div>
        </main>
      </div>

      <Modal
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        gallery={galleryList}
        currentIndex={previewIndex}
        onNavigate={(idx) => setPreviewIndex(idx)}
      />
    </div>
  );
};

export default StudioLayout;
