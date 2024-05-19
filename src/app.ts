import * as k8s from '@kubernetes/client-node';
import { AbstractReconciler, Controller,  ReconcileRequest,  WatchSpec  } from './controller';

class NamespaceReconciler extends AbstractReconciler<k8s.V1Namespace> {
  public static watchSpec = WatchSpec.forV1Namespaces()
  
  public async reconcile(req: ReconcileRequest<k8s.V1Namespace>): Promise<void> {
    
    if (req.phase === 'ADDED') {
      console.log('new NS object:');
    } else if (req.phase === 'MODIFIED') {
      console.log('changed NS object:');
    } else if (req.phase === 'DELETED') {
      console.log('deleted NS object:');
    } else {
      console.log('unknown type: ' + req.phase);
    }

    console.log(this.resourceApiUrl(req));
    console.log(this.statusUrl(req));
  }
}

const main = async () => {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();

  const exit = (reason: string, code?: number | undefined) => {
    console.log(`Exit: ${reason}`);
    controller.stop();
    process.exit(code);
  };

  process
    .on('SIGTERM', () => exit('SIGTERM'))
    .on('SIGINT', () => exit('SIGINT'));

  const controller = new Controller(kc).withReconciler(WatchSpec.forV1Namespaces(), new NamespaceReconciler(kc));

  await controller.start(err => {
    exit(err, err ? 1 : 0);
  });
  
};

main();





