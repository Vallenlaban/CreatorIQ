import React, { useState } from 'react';
import StudioLayout from '../layouts/StudioLayout';
import OverviewCards from '../components/studio/OverviewCards';
import TitleIntelligence from '../components/studio/TitleIntelligence';
import ThumbnailStudio from '../components/studio/ThumbnailStudio';
import FeedSimulator from '../components/studio/FeedSimulator';
import ViralRepurposer from '../components/studio/ViralRepurposer';

export const Studio = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [simulatorVariant, setSimulatorVariant] = useState(null);
  const [projectData, setProjectData] = useState(null);

  const handleTestInSimulator = (variantData) => {
    setSimulatorVariant(variantData);
    setActiveTab('simulator');
  };

  return (
    <StudioLayout activeTab={activeTab} onSelectTab={setActiveTab}>
      {activeTab === 'home' && <OverviewCards onSelectTab={setActiveTab} />}
      {activeTab === 'title' && <TitleIntelligence onTestInSimulator={handleTestInSimulator} />}
      {activeTab === 'thumbnail' && <ThumbnailStudio onTestInSimulator={handleTestInSimulator} />}
      {activeTab === 'simulator' && (
        <FeedSimulator initialVariant={simulatorVariant} onSelectTab={setActiveTab} />
      )}
      {activeTab === 'repurposer' && (
        <ViralRepurposer
          onSelectTab={setActiveTab}
          onTestInSimulator={handleTestInSimulator}
          currentProjectData={projectData}
        />
      )}
    </StudioLayout>
  );
};

export default Studio;
