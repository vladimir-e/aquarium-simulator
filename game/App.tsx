import { useState } from 'react';
import GameShell from './components/layout/GameShell';
import Timeline from './components/layout/Timeline';
import TabBar, { TabId } from './components/layout/TabBar';
import TankCanvas from './components/tank/TankCanvas';
import TankPanel from './components/panels/TankPanel';
import EquipmentPanel from './components/panels/EquipmentPanel';
import PlantsPanel from './components/panels/PlantsPanel';
import LivestockPanel from './components/panels/LivestockPanel';
import ActionsPanel from './components/panels/ActionsPanel';
import LogsPanel from './components/panels/LogsPanel';

function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('tank');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFastForward, setIsFastForward] = useState(false);

  const handlePlayPause = (): void => {
    setIsPlaying(!isPlaying);
    if (isFastForward) setIsFastForward(false);
  };

  const handleFastForward = (): void => {
    if (!isPlaying) setIsPlaying(true);
    setIsFastForward(!isFastForward);
  };

  const renderPanel = (): React.ReactElement => {
    switch (activeTab) {
      case 'tank':
        return <TankPanel />;
      case 'equipment':
        return <EquipmentPanel />;
      case 'plants':
        return <PlantsPanel />;
      case 'livestock':
        return <LivestockPanel />;
      case 'actions':
        return <ActionsPanel />;
      case 'logs':
        return <LogsPanel />;
      default:
        return <TankPanel />;
    }
  };

  return (
    <GameShell
      header={
        <Timeline
          time="11:00"
          day={1}
          isPlaying={isPlaying}
          isFastForward={isFastForward}
          onPlayPause={handlePlayPause}
          onFastForward={handleFastForward}
        />
      }
      tank={<TankCanvas />}
      tabs={<TabBar activeTab={activeTab} onTabChange={setActiveTab} />}
      panel={renderPanel()}
    />
  );
}

export default App;
