import * as SecureStore from 'expo-secure-store';

const K = 'anthropic_api_key';
export const getApiKey = () => SecureStore.getItemAsync(K);
export const setApiKey = (v: string) => (v ? SecureStore.setItemAsync(K, v) : SecureStore.deleteItemAsync(K));
