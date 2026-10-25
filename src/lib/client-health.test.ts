import {it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),rpc:vi.fn(),abort:vi.fn(),platform:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:mocks.session},rpc:mocks.rpc}}));
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:mocks.platform}}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.stubEnv('DEV',false);mocks.session.mockResolvedValue({data:{session:{user:{id:'private-user'}}}});mocks.rpc.mockReturnValue({abortSignal:mocks.abort});mocks.abort.mockResolvedValue({error:null});mocks.platform.mockReturnValue('web');});
it('sends only a generated ID, fixed kind and platform',async()=>{
 const {reportClientHealth}=await import('./client-health');await reportClientHealth('render_error');
 expect(mocks.rpc).toHaveBeenCalledOnce();
 const [name,body]=mocks.rpc.mock.calls[0];expect(name).toBe('record_client_health');
 expect(Object.keys(body).sort()).toEqual(['p_id','p_kind','p_platform']);expect(body.p_kind).toBe('render_error');expect(body.p_platform).toBe('web');
 expect(JSON.stringify(body)).not.toContain('private-user');
});
it('does not collect signed-out or development errors',async()=>{
 const {reportClientHealth}=await import('./client-health');mocks.session.mockResolvedValue({data:{session:null}});await reportClientHealth('render_error');expect(mocks.rpc).not.toHaveBeenCalled();
 vi.stubEnv('DEV',true);mocks.session.mockRejectedValue(new Error('must not access session'));await reportClientHealth('render_error');expect(mocks.rpc).not.toHaveBeenCalled();
});
it('never throws when auth or reporting fails',async()=>{
 const {reportClientHealth}=await import('./client-health');mocks.session.mockRejectedValue(new Error('session unavailable'));await expect(reportClientHealth('render_error')).resolves.toBeUndefined();
 mocks.session.mockResolvedValue({data:{session:{}}});mocks.abort.mockRejectedValue(new Error('network timeout'));await expect(reportClientHealth('render_error')).resolves.toBeUndefined();
});
it('bounds error storms and normalizes unsupported platforms',async()=>{
 const {reportClientHealth}=await import('./client-health');mocks.platform.mockReturnValue('https://private.example/?lat=40.123');
 for(let i=0;i<20;i++) await reportClientHealth('unhandled_error');expect(mocks.rpc).toHaveBeenCalledTimes(10);expect(mocks.rpc.mock.calls[0][1].p_platform).toBe('web');
});
