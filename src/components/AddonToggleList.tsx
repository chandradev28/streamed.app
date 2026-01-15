import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Switch,
    Platform,
} from 'react-native';
import { ADDON_REGISTRY, getEnabledAddons, toggleAddon, StremioAddon } from '../services/stremioAddons';

interface AddonToggleListProps {
    onToggle?: (addonId: string, enabled: boolean) => void;
}

export const AddonToggleList: React.FC<AddonToggleListProps> = ({ onToggle }) => {
    const [enabledAddons, setEnabledAddons] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadEnabledAddons();
    }, []);

    const loadEnabledAddons = async () => {
        const enabled = await getEnabledAddons();
        setEnabledAddons(enabled);
        setLoading(false);
    };

    const handleToggle = async (addon: StremioAddon) => {
        const isCurrentlyEnabled = enabledAddons.includes(addon.id);
        const newEnabled = !isCurrentlyEnabled;

        // Optimistic update
        if (newEnabled) {
            setEnabledAddons([...enabledAddons, addon.id]);
        } else {
            setEnabledAddons(enabledAddons.filter(id => id !== addon.id));
        }

        // Persist
        await toggleAddon(addon.id, newEnabled);
        onToggle?.(addon.id, newEnabled);
    };

    if (loading) {
        return null;
    }

    return (
        <View style={styles.container}>
            <Text style={styles.sectionTitle}>Stream Sources</Text>
            <Text style={styles.description}>
                Enable sources to search for cached torrents
            </Text>

            {ADDON_REGISTRY.map((addon) => (
                <TouchableOpacity
                    key={addon.id}
                    style={styles.addonItem}
                    onPress={() => handleToggle(addon)}
                    activeOpacity={0.7}
                >
                    <View style={styles.addonInfo}>
                        <Text style={styles.addonIcon}>{addon.icon}</Text>
                        <View style={styles.addonText}>
                            <Text style={styles.addonName}>{addon.name}</Text>
                            <Text style={styles.addonDescription}>{addon.description}</Text>
                        </View>
                    </View>
                    <Switch
                        value={enabledAddons.includes(addon.id)}
                        onValueChange={() => handleToggle(addon)}
                        trackColor={{ false: '#3e3e3e', true: '#4CAF50' }}
                        thumbColor={enabledAddons.includes(addon.id) ? '#fff' : '#f4f3f4'}
                        ios_backgroundColor="#3e3e3e"
                    />
                </TouchableOpacity>
            ))}

            <Text style={styles.hint}>
                All sources use your TorBox API key to show only cached torrents
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 6,
    },
    description: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 16,
    },
    addonItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    addonInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    addonIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    addonText: {
        flex: 1,
    },
    addonName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 2,
    },
    addonDescription: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    hint: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
        marginTop: 12,
        fontStyle: 'italic',
    },
});
