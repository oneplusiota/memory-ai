import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Props = {
  isListening: boolean;
  onPress: () => void;
  disabled?: boolean;
};

export function RecordButton({ isListening, onPress, disabled }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.12, duration: 700, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      scale.stopAnimation();
      Animated.timing(scale, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [isListening, scale]);

  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.wrapper}>
      <Animated.View
        style={[
          styles.button,
          isListening && styles.active,
          disabled && styles.disabled,
          { transform: [{ scale }] },
        ]}
      >
        <MaterialCommunityIcons
          name={isListening ? 'stop' : 'microphone'}
          size={40}
          color="white"
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  button: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#6200EE',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  active: { backgroundColor: '#B00020' },
  disabled: { opacity: 0.4 },
});
