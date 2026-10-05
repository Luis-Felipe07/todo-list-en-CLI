import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';


type taskStatus =
   | 'PENDING'      
   | 'IN_PROGRESS'  
   | 'UNDER_REVIEW' 
   | 'BLOCKED'    
   | 'COMPLETED'   
   | 'CANCELLED'   

enum Priority{
    low = 1,        
    average = 2,
    high = 3,
    criticism = 4
}


//esto representa un string no vacio 
export type NonEmptyString = string & { readonly __brand: 'NonEmptyString'   };


//valido en tiempo de ejecucion que el valor no sea vacio 
export function NonEmptyString(val: string): NonEmptyString{
        if(!val || val.trim().length === 0){
            throw new Error('El valor no puede ser vacio')
        }

        return val as NonEmptyString;
}

//alias especificos

export type taskID = NonEmptyString & {readonly __taskID: unique symbol}; 
export type Tag = NonEmptyString & { readonly __tag: unique symbol};

//y voy a necesitar algo para crear tareas con id de string 

export function createTaskID(id: string): taskID{
    return NonEmptyString(id) as taskID;
}

export function createTag(tag: string): Tag{
    return NonEmptyString(tag) as Tag;
}

//Creo la interfaz para tarea
export interface StateChange{
   previousState: taskStatus;
    conditionNew: taskStatus;
    date: Date;
}


//ahora si la interfaz

export interface task {
    readonly id: taskID;
    title: NonEmptyString;
    description?: string | null;
    state: taskStatus;
    priority: Priority;
    assignedTo: string;
    tags: Tag;
    readonly creationDate: Date;
    UpdateDate: Date
    statusHistory: StateChange[];
    
}



const Allowed_transitions: Record<taskStatus, ReadonlySet<taskStatus>> = {
    
    PENDING: new Set(['IN_PROGRESS', 'CANCELLED']),
    IN_PROGRESS: new Set(['UNDER_REVIEW','BLOCKED','CANCELLED']),
    BLOCKED: new Set(['IN_PROGRESS','CANCELLED']),
    UNDER_REVIEW: new Set(['IN_PROGRESS','COMPLETED','CANCELLED']),
    COMPLETED: new Set(),
    CANCELLED:  new Set(),
};


function isValidTransition(current: taskStatus, after: taskStatus ): boolean {
    return Allowed_transitions[current].has(after);
}

//representa estados de exito o error que implementare mas adelante
type Result<T, E> = 
  | { status: 'Exit'; value: T }
  | { status: 'Error'; error: E };


export const Exit = <T>(value: T) => ({
    ok: true,
    value
} )

export const theError = <E>(value: E) => ({
    ok: true,
    value
})

enum taskError{
    INVALID_TITLE = 'el titulo es invalido o esta vacio',
    TRANSITION_NOT_ALLOWED = "No se Permite La transicion",
    TASK_NOT_FOUND = "error, no se encontro la tarea",
    DUPLICATED_ID = "id duplicado"
}

interface taskRepository{
    getForID(id: taskID ) : Result<task, taskError>;
    save(task: task) : Result<task, taskError>;
    listAll(): task[];
    delete(id: taskID): Result<void, taskError>;
}



class InMemoryRepository implements taskRepository {

    private tasks: Map<taskID, task> = new Map();
    

    /*Busco una tarea utilizando su ID. Si no existe una tarea con ese ID,
     devuelvo un resultado de error indicando error. Si existe, devuelvo
      un resultado exitoso con  la tarea encontrada */
    getForID(id: taskID): Result<task, taskError> {
        
            if(!this.tasks.has(id)){
                return { status: 'Error', error: taskError.TASK_NOT_FOUND };
            }
        return {
            status: 'Exit' ,
            value:  this.tasks.get(id)!
        };
    }

    save(task: task): Result<task, taskError> {
      
       this.tasks.set(task.id, task);
       


        return   {status: 'Exit', value: task};
    }

    listAll(): task[] {


        //posible optimizacion para devolver un array de tareas en lugar de un Map
        return Array.from(this.tasks.values());

        //return Object.values(this.tasks)
    }

    delete(id: taskID): Result<void, taskError> {
        if(!this.tasks.has(id)){
             return { status: 'Error', error: taskError.TASK_NOT_FOUND };
        }

        this.tasks.delete(id);

        return {status: "Exit", value: undefined};
    }
        
}


function createTask(repo: taskRepository,
                    id: string, 
                    title: string,
                    priority: Priority,
                    assignedTo: string,
                    tags: Tag,
                    state: taskStatus,
                    


): Result<task, taskError>{
  
    if(title.trim() == ""){
       
    return{
        status: 'Error',
        error: taskError.INVALID_TITLE
    };
    } 

    try {
    const currentId = createTaskID(id);
    if (repo.getForID(currentId).status === 'Exit') {
      return {
        status: 'Error',
        error: taskError.DUPLICATED_ID,
      };
    }

    const newTask: task = {
      id: currentId,
      title: NonEmptyString(title),
      description: null,
      priority: priority,
      assignedTo: assignedTo,
      state: state,
      tags: tags,
      creationDate: new Date(),
      UpdateDate: new Date(),
      statusHistory: [],
    };

    return {
      status: 'Exit',
      value: newTask,
    };
  } catch {
    return {
      status: 'Error',
      error: taskError.INVALID_TITLE,
    };
  }
}

function changeStatus(repo: taskRepository, 
                      id: taskID,
                      newState: taskStatus,
                      reason?: string

                       
): Result<task, taskError>{
    

        const foundResult = repo.getForID(id);
      

    // verifica que se encuentre el id o que sea real
    if(foundResult.status === 'Error'){
       
        return{
            status: 'Error',
            error: taskError.TASK_NOT_FOUND
        };

        
    }
    
    const task = foundResult.value;

    //si la transicion no es valida retorno error 
    if(!isValidTransition(task.state, newState)){
        return{
            status: 'Error',
            error: taskError.TRANSITION_NOT_ALLOWED

        };
    }


    // Registro el cambio de estado de la tarea, 
    // guardando el estado anterior, 
    // el nuevo estado y la fecha en que ocurrio
    const change: StateChange = {
       previousState: task.state,
       conditionNew: newState,
       date:  new Date(),
      // reason: reason
    }
    

    const taskUpdate = {...task,
                        State: newState,
                        updateDate: new Date(),
                        statusHistory: [...task.statusHistory, change] 
                        

    }

    return repo.save(taskUpdate)

}

type predicateTask = (task: task) => boolean;

//esta funcion filtra las tareas por estados
function forState(state: taskStatus) : predicateTask{
    return (t: task) => t.state === state;
}

//filtrado por prioridad 
function byPriority(priority: Priority): predicateTask{
    return (t: task) => t.priority === priority;
}

//por asigancion 
function byAssignment(user: string): predicateTask{
    return (t: task) => t.assignedTo == user;
}

function byTag(tag: Tag): predicateTask{
    return (t: task) => t.tags.includes(tag);
}

function Combine(predicates: predicateTask[] ): predicateTask{
    // Retorna un nuevo predicado que evalúa una tarea 't': .every() actúa como un "Y" lógico, 
    // asegurando que la tarea cumpla con TODOS los predicados de la lista.
    return (t: task) => predicates.every(predicates => predicates(t));
}


function filterTasks(repo: taskRepository, predicate: predicateTask) : task[]{
    return repo.listAll().filter(predicate);
}


// analiticas

interface Analytics {
    totalTask: number,
    forState: Map<taskStatus, number>,
    forPriority: Map<Priority, number>
    averageResolutionTime: number,
    expiredOrBlocked: number
}

//calcular analiticas 
function calculateAnalytics(repo: taskRepository): Analytics{
   const  tasks = repo.listAll();

   const countByState = tasks.reduce((cbs, t) => {
        cbs.set(t.state,(cbs.get(t.state) || 0 ) +1 );
        return cbs;
   }, new Map<taskStatus, number>());


  const countByPriority = tasks.reduce((cbp, t) => {
    cbp.set(t.priority, (cbp.get(t.priority) || 0 ) +1);
    return cbp;
  }, new Map<Priority, number>())
    
  const complete = tasks.filter((t) => t.state === 'COMPLETED' )
  const time = complete.map(t => (t.UpdateDate.getTime() - t.creationDate.getTime()))

  
  //uso operdaor ternario para sacar el promedio de tiempos de las tareas
  const average  = time.length > 0 ? time.reduce((avg, t) => avg + t, 0) / time.length : 0;

  const blocked = tasks.filter(t => t.state === 'BLOCKED').length
 
  
   return  {
    totalTask: tasks.length,
    forState: countByState,
    forPriority: countByPriority,
    averageResolutionTime: average,
    expiredOrBlocked: blocked
  };
 
// FUNCIONES AUXILIARES Y DE FORMATO DEL CLI


}
function formatTaskSummary(t: task): string {
  return `[${t.id}] ${t.title} | Estado: ${t.state} | Prioridad: ${priorityToText(t.priority)} | Responsable: ${t.assignedTo}`;
}

function optionToPriority(option: string): Priority | null {
  switch (option) {
    case '1':
      return Priority.low;
    case '2':
      return Priority.average;
    case '3':
      return Priority.high;
    case '4':
      return Priority.criticism;
    default:
      return null;
  }
}

function priorityToText(p: Priority): string {
  switch (p) {
    case Priority.low:
      return 'Baja';
    case Priority.average:
      return 'Media';
    case Priority.high:
      return 'Alta';
    case Priority.criticism:
      return 'Crítica';
    default:
      return 'Desconocida';
  }
}

function optionToStatus(option: string): taskStatus | null {
  switch (option) {
    case '1':
      return 'PENDING';
    case '2':
      return 'IN_PROGRESS';
    case '3':
      return 'UNDER_REVIEW';
    case '4':
      return 'BLOCKED';
    case '5':
      return 'COMPLETED';
    case '6':
      return 'CANCELLED';
    default:
      return null;
  }
}

async function promptStatus(rl: readline.Interface): Promise<taskStatus | null> {
  console.log('1. Pendiente');
  console.log('2. En progreso');
  console.log('3. En revisión');
  console.log('4. Bloqueada');
  console.log('5. Completada');
  console.log('6. Cancelada');
  const option = await rl.question('Selecciona estado: ');
  return optionToStatus(option.trim());
}

async function promptPriority(rl: readline.Interface): Promise<Priority | null> {
  console.log('1. Baja');
  console.log('2. Media');
  console.log('3. Alta');
  console.log('4. Crítica');
  const option = await rl.question('Selecciona prioridad: ');
  return optionToPriority(option.trim());
}

// =====================================================================
// FLUJOS DEL CLI
// =====================================================================

async function createTaskFlow(repo: taskRepository, rl: readline.Interface) {
  console.log('\n--- Crear nueva tarea ---');
  const id = (await rl.question('ID: ')).trim();
  const title = (await rl.question('Título: ')).trim();
  const description = (await rl.question('Descripción opcional: ')).trim();
  const assignedTo = (await rl.question('Asignada a: ')).trim();
  const tagStr = (await rl.question('Etiqueta: ')).trim();

  console.log('Prioridad:');
  const priority = await promptPriority(rl);

  if (priority === null) {
    console.log('Prioridad inválida');
    return;
  }

  try {
    const tag = createTag(tagStr);
    const result = createTask(
      repo,
      id,
      title,
      priority,
      assignedTo,
      tag,
      'PENDING'
    );

    if (result.status === 'Exit') {
      const taskItem = result.value;
      taskItem.description = description.length > 0 ? description : null;
      repo.save(taskItem);

      console.log('\nTarea creada correctamente');
      console.log(formatTaskSummary(taskItem));
    } else {
      console.log('\nNo se pudo crear la tarea');
      console.log(result.error);
    }
  } catch (err: any) {
    console.log('\nError en los datos ingresados:', err.message || err);
  }
}

async function listTasksFlow(repo: taskRepository) {
  const tasks = repo.listAll();
  if (tasks.length === 0) {
    console.log('\nNo hay tareas registradas');
    return;
  }

  console.log('\n--- Tareas registradas ---');
  for (const taskItem of tasks) {
    console.log(formatTaskSummary(taskItem));
  }
}

async function showTaskDetailFlow(repo: taskRepository, rl: readline.Interface) {
  const id = (await rl.question('\nID de la tarea: ')).trim();

  try {
    const taskId = createTaskID(id);
    const result = repo.getForID(taskId);

    if (result.status === 'Error') {
      console.log('No se encontró la tarea');
      return;
    }

    const t = result.value;

    console.log('\n--- Detalle de tarea ---');
    console.log(`ID: ${t.id}`);
    console.log(`Título: ${t.title}`);
    console.log(`Descripción: ${t.description ?? ''}`);
    console.log(`Estado: ${t.state}`);
    console.log(`Prioridad: ${priorityToText(t.priority)}`);
    console.log(`Asignada a: ${t.assignedTo}`);
    console.log(`Etiqueta: ${t.tags}`);
    console.log(`Creada: ${t.creationDate.toLocaleString()}`);
    console.log(`Actualizada: ${t.UpdateDate.toLocaleString()}`);

    if (t.statusHistory.length === 0) {
      console.log('Sin cambios de estado');
    } else {
      console.log('Historial de estados:');
      for (const change of t.statusHistory) {
        console.log(
          `  ${change.previousState} -> ${change.conditionNew} en ${change.date.toLocaleString()}`
        );
      }
    }
  } catch {
    console.log('ID inválido o no encontrado');
  }
}

async function changeStatusFlow(repo: taskRepository, rl: readline.Interface) {
  const idStr = (await rl.question('\nID de la tarea: ')).trim();

  console.log('Nuevo estado:');
  const newStatus = await promptStatus(rl);

  if (!newStatus) {
    console.log('Estado inválido');
    return;
  }

  const reason = (await rl.question('Razón opcional del cambio: ')).trim();

  try {
    const taskId = createTaskID(idStr);
    const result = changeStatus(repo, taskId, newStatus, reason);

    if (result.status === 'Exit') {
      console.log('\nEstado actualizado correctamente');
      console.log(formatTaskSummary(result.value));
    } else {
      console.log('\nNo se pudo cambiar el estado');
      console.log(result.error);
    }
  } catch {
    console.log('ID inválido');
  }
}

async function filterTasksFlow(repo: taskRepository, rl: readline.Interface) {
  console.log('\nFiltrar por:');
  console.log('1. Estado');
  console.log('2. Prioridad');
  console.log('3. Responsable');
  console.log('4. Etiqueta');

  const filterOption = (await rl.question('Selecciona filtro: ')).trim();
  let criterion: predicateTask | null = null;

  if (filterOption === '1') {
    const status = await promptStatus(rl);
    if (status) criterion = forState(status);
  } else if (filterOption === '2') {
    const priority = await promptPriority(rl);
    if (priority !== null) criterion = byPriority(priority);
  } else if (filterOption === '3') {
    const assignee = (await rl.question('Responsable: ')).trim();
    criterion = byAssignment(assignee);
  } else if (filterOption === '4') {
    const tagInput = (await rl.question('Etiqueta: ')).trim();
    try {
      criterion = byTag(createTag(tagInput));
    } catch {
      console.log('Etiqueta inválida');
      return;
    }
  } else {
    console.log('Filtro inválido');
    return;
  }

  if (!criterion) {
    console.log('Criterio inválido');
    return;
  }

  const tasks = filterTasks(repo, criterion);

  if (tasks.length === 0) {
    console.log('\nNo se encontraron tareas con ese criterio');
    return;
  }

  console.log('\n--- Resultados del filtro ---');
  for (const taskItem of tasks) {
    console.log(formatTaskSummary(taskItem));
  }
}

async function showAnalyticsFlow(repo: taskRepository) {
  const analytics = calculateAnalytics(repo);

  if (analytics.totalTask === 0) {
    console.log('\nNo hay analíticas disponibles');
    return;
  }

  console.log('\n--- Analíticas ---');
  console.log(`Total de tareas: ${analytics.totalTask}`);

  console.log('Tareas por estado:');
  analytics.forState.forEach((count, status) => {
    console.log(`  ${status}: ${count}`);
  });

  console.log('Tareas por prioridad:');
  analytics.forPriority.forEach((count, priority) => {
    console.log(`  ${priorityToText(priority)}: ${count}`);
  });

  console.log(`Promedio de resolución (ms): ${analytics.averageResolutionTime}`);
  console.log(`Bloqueadas: ${analytics.expiredOrBlocked}`);
}

async function deleteTaskFlow(repo: taskRepository, rl: readline.Interface) {
  const idStr = (await rl.question('\nID de la tarea a eliminar: ')).trim();
  const confirmation = (await rl.question('Escribe SI para confirmar: ')).trim();

  if (confirmation !== 'SI') {
    console.log('Eliminación cancelada');
    return;
  }

  try {
    const taskId = createTaskID(idStr);
    const result = repo.delete(taskId);

    if (result.status === 'Exit') {
      console.log('Tarea eliminada correctamente');
    } else {
      console.log('No se pudo eliminar la tarea');
      console.log(result.error);
    }
  } catch {
    console.log('ID inválido');
  }
}

// =====================================================================
// BUCLE PRINCIPAL (CLI)
// =====================================================================

async function main() {
  const repo = new InMemoryRepository();
  const rl = readline.createInterface({ input, output });

  console.log('Gestor de tareas por consola');

  let option = '';
  do {
    console.log('\n1. Crear tarea');
    console.log('2. Listar todas las tareas');
    console.log('3. Ver detalle de una tarea');
    console.log('4. Cambiar estado de una tarea');
    console.log('5. Filtrar tareas');
    console.log('6. Ver analíticas');
    console.log('7. Eliminar tarea');
    console.log('0. Salir');

    option = (await rl.question('\nSelecciona una opción: ')).trim();

    switch (option) {
      case '1':
        await createTaskFlow(repo, rl);
        break;
      case '2':
        await listTasksFlow(repo);
        break;
      case '3':
        await showTaskDetailFlow(repo, rl);
        break;
      case '4':
        await changeStatusFlow(repo, rl);
        break;
      case '5':
        await filterTasksFlow(repo, rl);
        break;
      case '6':
        await showAnalyticsFlow(repo);
        break;
      case '7':
        await deleteTaskFlow(repo, rl);
        break;
      case '0':
        console.log('Saliendo...');
        break;
      default:
        console.log('Opción inválida');
        break;
    }
  } while (option !== '0');

  rl.close();
}


main();
