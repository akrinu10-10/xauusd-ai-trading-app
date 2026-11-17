// src/components/TypedWebView.ts
import { ComponentType, RefAttributes } from "react";
import { WebView, WebViewProps } from "react-native-webview";

export const TypedWebView = WebView as unknown as ComponentType<
  WebViewProps & RefAttributes<WebView>
>;