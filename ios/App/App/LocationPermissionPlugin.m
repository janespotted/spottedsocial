#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LocationPermissionPlugin, "LocationPermission",
    CAP_PLUGIN_METHOD(requestAlways, CAPPluginReturnPromise);
)
