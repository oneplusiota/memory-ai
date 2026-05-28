import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Props = {
  isRecording: boolean;
  disabled?: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
};

export function HoldMicButton({ isRecording, disabled, onPressIn, onPressOut }: Props) {
  const scale = useSharedValue(1);
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
    if (isRecording) {
      scale.value = withTiming(1.12, { duration: 150 });
      ringOpacity.value = withTiming(1, { duration: 200 });
      ringScale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 700 }),
          withTiming(1.0, { duration: 0 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(ringScale);
      scale.value = withTiming(1, { duration: 150 });
      ringOpacity.value = withTiming(0, { duration: 200 });
      ringScale.value = withTiming(1, { duration: 150 });
    }
  }, [isRecording]);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
    >
      <Animated.View style={styles.wrapper}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={[styles.button, isRecording && styles.buttonActive, disabled && styles.disabled, buttonStyle]}>
          <MaterialCommunityIcons
            name={isRecording ? 'stop' : 'microphone'}
            size={32}
            color="white"
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, borderColor: '#7C3AED',
  },
  button: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#6D28D9',
    alignItems: 'center', justifyContent: 'center',
    elevation: 8,
  },
  buttonActive: { backgroundColor: '#B91C1C' },
  disabled: { opacity: 0.4 },
});
