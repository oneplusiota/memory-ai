import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { QuickCaptureWidget } from './QuickCaptureWidget';

const WIDGETS: Record<string, () => React.JSX.Element> = {
  QuickCapture: QuickCaptureWidget,
};

/**
 * Draws the widget when it is added or resized. Taps are handled natively
 * (OPEN_URI), so no click handling is needed here.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const Widget = WIDGETS[props.widgetInfo.widgetName];
  if (!Widget) return;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<Widget />);
      break;
    default:
      break;
  }
}
