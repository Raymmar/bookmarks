import React from 'react';
import { Slider } from '@/components/ui/slider';
import { 
  ReadingLength, 
  READING_LENGTH_CONFIG 
} from '@/hooks/use-report-preferences';

interface ReadingLengthSliderProps {
  value: ReadingLength;
  onChange: (value: ReadingLength) => void;
}

const ReadingLengthSlider: React.FC<ReadingLengthSliderProps> = ({ 
  value, 
  onChange 
}) => {
  const readingLengthValues: ReadingLength[] = ['quick', 'default', 'deep'];
  const valueIndex = readingLengthValues.indexOf(value);
  
  const handleSliderChange = (newValue: number[]) => {
    const index = Math.round(newValue[0]);
    onChange(readingLengthValues[index]);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium">Reading Length</h4>
        <span className="text-sm font-medium">
          {READING_LENGTH_CONFIG[value].label}
        </span>
      </div>
      
      <Slider
        value={[valueIndex]}
        min={0}
        max={2}
        step={1}
        onValueChange={handleSliderChange}
      />
      
      <div className="flex justify-between text-xs text-gray-500 px-1 mt-1">
        <span>Quick Read</span>
        <span>Default</span>
        <span>Deep Dive</span>
      </div>
    </div>
  );
};

export default ReadingLengthSlider;