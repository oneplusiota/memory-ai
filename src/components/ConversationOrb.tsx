import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { OrbState } from '@/types';

const STATE_COLORS: Record<OrbState, [string, string, string]> = {
  idle: ['#7C3AED', '#4F46E5', '#6D28D9'],
  listening: ['#0EA5E9', '#06B6D4', '#3B82F6'],
  thinking: ['#8B5CF6', '#7C3AED', '#A855F7'],
  responding: ['#6366F1', '#4F46E5', '#818CF8'],
  paused: ['#6B7280', '#4B5563', '#9CA3AF'],
};

type Props = { orbState: OrbState; size?: number };

export function ConversationOrb({ orbState, size = 140 }: Props) {
  const scale = useSharedValue(1);
  const outerOpacity = useSharedValue(0.25);
  const rotation = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(outerOpacity);
    cancelAnimation(rotation);

    if (orbState === 'idle') {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
      outerOpacity.value = withRepeat(
        withSequence(
          withTiming(0.35, { duration: 1500 }),
          withTiming(0.15, { duration: 1500 }),
        ),
        -1,
        false,
      );
    } else if (orbState === 'listening') {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 350, easing: Easing.out(Easing.quad) }),
          withTiming(1.02, { duration: 350, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      );
      outerOpacity.value = withRepeat(
        withSequence(withTiming(0.5, { duration: 350 }), withTiming(0.2, { duration: 350 })),
        -1,
        false,
      );
    } else if (orbState === 'thinking') {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 800 }),
          withTiming(0.97, { duration: 800 }),
        ),
        -1,
        false,
      );
      rotation.value = withRepeat(withTiming(360, { duration: 2400, easing: Easing.linear }), -1, false);
      outerOpacity.value = withRepeat(
        withSequence(withTiming(0.45, { duration: 800 }), withTiming(0.2, { duration: 800 })),
        -1,
        false,
      );
    } else if (orbState === 'responding') {
      scale.value = withSequence(
        withTiming(1.08, { duration: 200 }),
        withTiming(1.02, { duration: 400 }),
        withTiming(1.0, { duration: 300 }),
      );
      outerOpacity.value = withSequence(
        withTiming(0.5, { duration: 200 }),
        withTiming(0.2, { duration: 600 }),
      );
    } else {
      scale.value = withTiming(1.0, { duration: 300 });
      outerOpacity.value = withTiming(0.15, { duration: 300 });
    }
  }, [orbState]);

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const outerStyle = useAnimatedStyle(() => ({
    opacity: outerOpacity.value,
    transform: [{ scale: scale.value * 1.35 }],
  }));

  const rotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const colors = STATE_COLORS[orbState];

  return (
    <View style={[styles.container, { width: size * 1.8, height: size * 1.8 }]}>
      {/* Outer glow */}
      <Animated.View style={[styles.outer, { width: size, height: size, borderRadius: size / 2 }, outerStyle]}>
        <LinearGradient colors={[colors[0] + '60', colors[1] + '30']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Core orb */}
      <Animated.View style={[styles.core, { width: size, height: size, borderRadius: size / 2 }, coreStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, rotationStyle]}>
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
          />
        </Animated.View>

        {/* Inner highlight */}
        <View style={[styles.highlight, { width: size * 0.35, height: size * 0.35, borderRadius: size * 0.175 }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  outer: { position: 'absolute', overflow: 'hidden' },
  core: { overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '18%' },
  highlight: { backgroundColor: 'rgba(255,255,255,0.25)' },
});
