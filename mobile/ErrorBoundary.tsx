import { Component, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// A render/runtime throw in a release build otherwise leaves a silent frozen
// screen with no signal. This surfaces the error text and offers a reset so
// failures are visible and (often) recoverable instead of looking like a hang.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            The app hit an unexpected error. This screen means it failed safely rather than
            freezing.
          </Text>
          <ScrollView style={styles.detailBox}>
            <Text style={styles.detailText}>
              {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
            </Text>
          </ScrollView>
          <TouchableOpacity style={styles.button} onPress={() => this.setState({ error: null })}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 80,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  detailBox: {
    maxHeight: 260,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
  },
  detailText: {
    fontSize: 12,
    color: '#374151',
    fontFamily: 'Courier',
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
