import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

/** Deep link handled by the Capture screen (see AppNavigator linking config). */
export const CAPTURE_URI = 'memoryai://capture';

/** Home-screen widget: one tap opens the bare capture screen, which starts listening immediately. */
export function QuickCaptureWidget() {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: CAPTURE_URI }}
      accessibilityLabel="Quick capture"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#6D28D9',
        borderRadius: 28,
        paddingHorizontal: 16,
      }}
    >
      <TextWidget text="🎙" style={{ fontSize: 26, color: '#FFFFFF' }} />
      <TextWidget
        text="  Tap to capture"
        style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}
      />
    </FlexWidget>
  );
}
