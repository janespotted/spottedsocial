#import <Capacitor/Capacitor.h>

CAP_PLUGIN(ScreenGuardPlugin, "ScreenGuard",
    CAP_PLUGIN_METHOD(enable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(disable, CAPPluginReturnPromise);
)
